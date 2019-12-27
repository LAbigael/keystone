const debug = require('debug')('keystone:core:descriptor')
const _ = require('lodash')
const hash = require('object-hash')
const daffy = require('daffy')
const { merge } = require('three-way-merge')
const { emit, EVENTS } = require('../../lib/pubsub')

const { getPubkey } = require('../file/gaia')
const KeystoneError = require('../error')
const CONSTANTS = require('../constants')
const { getPath, changeBlockstackId } = require('../descriptor-path')
const {
  readFileFromGaia,
  writeFileToGaia,
  deleteFilesFromGaia,
} = require('../file/gaia')

/**
 * Return the user's descriptor content.
 * @param {*} userSession
 * @param {*} param1
 */
const getDescriptor = (
  userSession,
  { env, project, type, filename, origin }
) => {
  debug('getDescriptor', type, filename)

  const { username } = userSession.loadUserData()

  const descriptorPath = getPath({
    blockstackId: username,
    env,
    project,
    type,
    filename,
  })

  return readFileFromGaia(userSession, {
    path: descriptorPath,
    origin,
  })
}

const getStableVersion = descriptors => {
  debug('getStableVersion')

  const descriptorsByVersion = descriptors.reduce((versions, descriptor) => {
    const versionCloned = versions

    if (!versions[descriptor.version]) {
      versionCloned[descriptor.version] = []
    }

    versionCloned[descriptor.version].push(descriptor)

    return versionCloned
  }, [])

  let indc = descriptorsByVersion.length - 1
  let lastVersionStable = descriptorsByVersion[indc]

  while (lastVersionStable.length > 1) {
    indc -= 1
    lastVersionStable = descriptorsByVersion[indc]
  }

  return lastVersionStable
}

const mergeContents = ({ left, right, base }) => {
  const merged = merge(left, base, right)
  return { result: merged.joinedResults(), conflict: merged.conflict }
}

const manageConflictBetweenDescriptors = async (descriptors = []) => {
  debug('manageConflictBetweenDescriptors')

  const newDescriptors = descriptors.filter(d => d)

  const maxVersion = _.max(newDescriptors, d => d.version)
  const descriptorsWithMaxVersion = newDescriptors.filter(
    d => d.version === maxVersion.version
  )

  if (descriptorsWithMaxVersion.length > 1) {
    const firstCheckSum = descriptorsWithMaxVersion[0].checksum

    const allSamechecksum = descriptorsWithMaxVersion.every(
      d => d.checksum === firstCheckSum
    )

    // Conflict !!
    if (!allSamechecksum) {
      // check what type of descriptor it is
      const result = await emit(EVENTS.CONFLICT, {
        conflictFiles: descriptorsWithMaxVersion,
      })

      return {
        merged: true,
        result,
      }
    }
  }
  return { merged: false }
}

// const extractInfoFromPath = path => {
//   let parts = path.split('/')
//   let type = 'project'
//   if (/members/.test(parts[1])) {
//     type = 'members'
//     parts[1] = parts[1].split('-')[0]
//   }
//   if (!/.*json/.test(parts[2])) {
//     env = parts[2]
//     if (/members/.test(parts[2])) {
//       type = 'members'
//       parts[2] = parts[2].split('-')[0]
//     }
//   } else {

//   }
//   const project = [parts[0], parts[1]].join('/')

//   return { project, env, filename }
// }
/**
 * Return the latest version of a descriptor and will manage conflict.
 * @param {*} userSession
 * @param {*} param1
 */
const getLatestDescriptorByPath = async (
  userSession,
  { descriptorPath, members },
  stableOnly = false
) => {
  debug('getLatestDescriptorByPath', descriptorPath)
  const { username } = userSession.loadUserData()
  let descriptors = await Promise.all(
    members.map(async member => {
      return readFileFromGaia(userSession, {
        path: descriptorPath,
        origin: member.blockstack_id,
      })
    })
  )

  descriptors = descriptors.filter(d => d)

  // Check conflicts between descriptors
  if (stableOnly) {
    return getStableVersion(descriptors)
  }

  const { merged, result } = await manageConflictBetweenDescriptors(descriptors)
  if (merged) {
    const newDescriptor = incrementVersion({
      descriptor: { ...descriptors[0], content: result },
      previousDescriptor: descriptors[0],
      type: descriptors[0].type,
      author: username,
    })

    await uploadDescriptorForEveryone(userSession, {
      members,
      descriptor: newDescriptor,
      type: descriptors[0].type,
    })

    if (descriptors[0].type === 'file') {
      // TODO update files checksums in  env descriptor
      const pathParts = descriptorPath.split('/')
      const envPath = pathParts.splice(pathParts.length - 2, 1).join('/')

      const envDescriptor = await getLatestDescriptorByPath(userSession, {
        descriptorPath: envPath,
        members,
      })
      // replace checksum for changed file
      envDescriptor.content = envDescriptor.content.map(file =>
        file.name === newDescriptor.name
          ? { ...file, checksum: hash(newDescriptor.content) }
          : file
      )
      await uploadDescriptorForEveryone(userSession, {
        members,
        descriptor: envDescriptor,
      })
    }
    return newDescriptor
  }

  return _.maxBy(descriptors, descriptor => descriptor.version)
}

/**
 * Return the current user's descriptor content.
 * @param {*} userSession
 * @param {*} param1
 */
const getOwnDescriptor = async (
  userSession,
  { env, project, type, filename }
) => {
  debug('getOwnDescriptor')

  const { username } = userSession.loadUserData()

  return getDescriptor(userSession, {
    env,
    project,
    type,
    filename,
    origin: username,
    blockstackId: username,
  })
}

const getOwnDescriptorByPath = (userSession, { descriptorPath }) => {
  debug('getOwnDescriptorByPath', descriptorPath)
  return readFileFromGaia(userSession, {
    path: descriptorPath,
  })
}

const uploadDescriptorForEveryone = (
  userSession,
  { members, descriptor, type }
) => {
  debug('uploadDescriptorForEveryone', type, descriptor.path)

  return Promise.all(
    members.map(async member => {
      const pubkey = await getPubkey(userSession, member)

      const descriptorPath = changeBlockstackId(
        descriptor.path,
        member.blockstack_id
      )

      return writeFileToGaia(userSession, {
        path: descriptorPath,
        origin: member.blockstack_id,
        content: JSON.stringify({ ...descriptor, path: descriptorPath }),
        encrypt: pubkey,
      })
    })
  )
}

const incrementVersion = ({
  descriptor,
  author,
  previousDescriptor = null,
  type,
}) => {
  debug('incrementVersion')

  const { content } = descriptor
  const newChecksum = hash(content)

  if (previousDescriptor) {
    // same content, no need to update
    if (newChecksum === previousDescriptor.checksum) {
      // we avoid throwing an error for project files
      // as it would happens everytime a user push files.
      if (type !== 'project' && type !== 'env') {
        throw new Error(
          'A version of this file with the same content already exists.'
        )
      }
    }
    const newEntry = {
      version: previousDescriptor.version,
      checksum: previousDescriptor.checksum,
      content: daffy.createPatch(
        JSON.stringify(content),
        JSON.stringify(previousDescriptor.content)
      ),
      sourcePatch: newChecksum,
      author: previousDescriptor.author,
    }
    const history =
      previousDescriptor.history && previousDescriptor.history.length > 0
        ? previousDescriptor.history
        : []

    return {
      ...descriptor,
      checksum: newChecksum,
      version: previousDescriptor.version + 1,
      history: [...history, newEntry],
      author,
    }
  }

  return {
    ...descriptor,
    checksum: newChecksum,
    version: 1,
    history: [],
    author,
  }
}

/**
 * Remove descriptor for members.
 * Physical file is also deleted on local disk if absoluteProjectPath is given
 * @param {*} userSession
 * @param {*} param1
 */
const removeDescriptorForMembers = async (
  userSession,
  { descriptorPath, project, env, type, members, absoluteProjectPath }
) => {
  debug('removeDescriptorForMembers', descriptorPath)

  // Remove physical file on local disk if absoluteProjectPath is given

  // *Ask Kévin*: Why do we need to delete files on disk? This should not be the responsibility
  // of the descriptor system.

  // if (absoluteProjectPath) {
  //   await deleteFileFromDisk(path.join(absoluteProjectPath, descriptorPath))
  // }

  // Remove file from gaiagetMembers
  const promises = members.map(async member => {
    const filePath = getPath({
      project,
      env,
      type,
      filename: descriptorPath,
      blockstackId: member,
    })
    await deleteFilesFromGaia(userSession, { path: filePath })
  })

  return Promise.all(promises)
}

const updateDescriptorForMembers = async (
  userSession,
  { env, project, type, membersDescriptor, content, name, updateAnyway = false }
) => {
  const { username } = userSession.loadUserData()

  const descriptorPath = getPath({
    project,
    env,
    type,
    filename: name,
    blockstackId: username,
  })

  const membersToWriteTo = extractMembersByRole(
    membersDescriptor,
    Object.values(CONSTANTS.ROLES)
  )

  let membersToReadFrom = []

  if (type === 'members') {
    membersToReadFrom = extractMembersByRole(membersDescriptor, [
      CONSTANTS.ROLES.ADMINS,
    ])
  } else {
    membersToReadFrom = extractMembersByRole(membersDescriptor, [
      CONSTANTS.ROLES.ADMINS,
      CONSTANTS.ROLES.CONTRIBUTORS,
    ])
  }

  // Retrieve the latest version of the file from everyone.
  const latestDescriptor = await getLatestDescriptorByPath(userSession, {
    descriptorPath,
    members: membersToReadFrom,
  })

  const previousDescriptor = await getOwnDescriptorByPath(userSession, {
    descriptorPath,
  })

  // The file does not exist at anywhere at all in the world
  if (!latestDescriptor && !previousDescriptor) {
    const descriptorToCreate = createDescriptor({
      name,
      project,
      content,
      author: username,
      env,
      type,
      version: 0,
    })

    await uploadDescriptorForEveryone(userSession, {
      members: membersToWriteTo,
      descriptor: descriptorToCreate,
      type,
    })

    return descriptorToCreate
  }

  if (!previousDescriptor && !content) {
    await uploadDescriptorForEveryone(userSession, {
      members: membersToWriteTo,
      descriptor: latestDescriptor,
      type,
    })

    return latestDescriptor
  }

  if (latestDescriptor && !previousDescriptor && !content) {
    throw new KeystoneError(
      'PullBeforeYouPush',
      'A version of this file exist with another content.\nPlease pull before pushing your file.'
    )
  }

  if (latestDescriptor && !previousDescriptor && content) {
    throw new KeystoneError(
      'PullBeforeYouPush',
      'A version of this file exist with another content.\nPlease pull before pushing your file.'
    )
  }
  if (latestDescriptor && previousDescriptor && content) {
    let newDescriptor = { ...previousDescriptor, content }

    if (hash(content) === previousDescriptor.checksum) {
      return previousDescriptor
    }

    const { result, merged } = await manageConflictBetweenDescriptors([
      latestDescriptor,
      previousDescriptor,
    ])

    try {
      newDescriptor = incrementVersion({
        descriptor: merged
          ? { ...newDescriptor, content: result }
          : newDescriptor,
        author: username,
        previousDescriptor,
        type,
      })
    } catch (err) {
      console.error(err)
      return newDescriptor
    }
    if (
      latestDescriptor.version === newDescriptor.version &&
      hash(latestDescriptor.content) !== hash(newDescriptor.content)
    ) {
      throw new KeystoneError(
        'PullBeforeYouPush',
        'A version of this file exist with another content.\nPlease pull before pushing your file.'
      )
    }

    if (latestDescriptor.version > newDescriptor.version) {
      await uploadDescriptorForEveryone(userSession, {
        members: membersToWriteTo,
        descriptor: latestDescriptor,
        type,
      })
      return latestDescriptor
    }

    await uploadDescriptorForEveryone(userSession, {
      members: membersToWriteTo,
      descriptor: newDescriptor,
      type,
    })
    return newDescriptor
  }

  if (latestDescriptor && previousDescriptor && !content) {
    if (latestDescriptor.version > previousDescriptor.version) {
      await uploadDescriptorForEveryone(userSession, {
        members: membersToWriteTo,
        descriptor: latestDescriptor,
        type,
      })
      return latestDescriptor
    }

    if (
      latestDescriptor.version === previousDescriptor.version &&
      !updateAnyway
    ) {
      return latestDescriptor
    }

    await uploadDescriptorForEveryone(userSession, {
      members: membersToWriteTo,
      descriptor: previousDescriptor,
      type,
    })
    return previousDescriptor
  }
}

const getMembersByRoles = async (userSession, { project, env }, roles) => {
  const membersDescriptor = await getLatestMembersDescriptor(userSession, {
    project,
    env,
  })

  return extractMembersByRole(membersDescriptor, roles)
}

const extractMembersByRole = (membersDescriptor, roles) => {
  if (membersDescriptor) {
    return roles.reduce((members, role) => {
      return [...members, ...membersDescriptor.content[role]]
    }, [])
  }

  return []
}

const isAdmin = (descriptor, blockstackId) => {
  return descriptor.content.admins.find(
    admin => admin.blockstack_id === blockstackId
  )
}
const getAdminsAndContributors = (userSession, { project, env }) => {
  return getMembersByRoles(userSession, { project, env }, [
    CONSTANTS.ROLES.CONTRIBUTORS,
    CONSTANTS.ROLES.ADMINS,
  ])
}
const getAdmins = (userSession, { project, env }) => {
  return getMembersByRoles(userSession, { project, env }, [
    CONSTANTS.ROLES.ADMINS,
  ])
}

const getMembers = (userSession, { project, env }) => {
  return getMembersByRoles(userSession, { project, env }, [
    CONSTANTS.ROLES.CONTRIBUTORS,
    CONSTANTS.ROLES.ADMINS,
    CONSTANTS.ROLES.READERS,
  ])
}

const updateDescriptor = async (
  userSession,
  { env, project, type, content, name, membersDescriptor, updateAnyway }
) => {
  debug('Update descriptor', type)

  // let members = []
  const { username } = userSession.loadUserData()

  const opts = {
    project,
    type: 'project',
    blockstackId: username,
  }

  if (type !== 'project') {
    opts.env = env
    opts.type = 'env'
  }

  if (!membersDescriptor) {
    membersDescriptor = await getLatestMembersDescriptor(userSession, {
      project,
      env,
    })
  }

  return updateDescriptorForMembers(userSession, {
    env,
    project,
    type,
    membersDescriptor,
    content,
    name,
    updateAnyway,
  })
}

const createDescriptor = ({ name, project, content, author, env, type }) => {
  return {
    path: getPath({
      project,
      filename: name,
      blockstackId: author,
      type,
      env,
    }),
    type,
    name,
    content,
    checksum: hash(content),
    history: [],
    author,
    version: 0,
  }
}

/**
 * Return last version of project descriptor.
 * @param {*} userSession
 * @param {*} param1
 */
const getLatestProjectDescriptor = async (userSession, { project, origin }) => {
  let projectDescriptor = await updateDescriptor(userSession, {
    project,
    type: 'project',
    name: project,
  })

  if (projectDescriptor) return projectDescriptor

  if (!projectDescriptor && origin) {
    projectDescriptor = await getDescriptor(userSession, {
      project,
      type: 'members',
      origin,
    })

    return updateDescriptor(userSession, {
      project,
      type: 'project',
      name: project,
      content: projectDescriptor.content,
    })
  }

  throw new Error(`No project descriptor found for ${project}`)
}

const getLatestEnvDescriptor = async (userSession, { project, env }) => {
  return updateDescriptor(userSession, {
    env,
    project,
    type: 'env',
    name: env,
  })
}

async function getLatestMembersDescriptor(
  userSession,
  { project, env, origin }
) {
  const ownMembersDescriptor = await getOwnDescriptor(userSession, {
    project,
    env,
    type: 'members',
  })

  if (ownMembersDescriptor) {
    return updateDescriptorForMembers(userSession, {
      env,
      project,
      type: 'members',
      name: 'members',
      membersDescriptor: ownMembersDescriptor,
    })
  }

  const ownProjectMembersDescriptor = await getOwnDescriptor(userSession, {
    project,
    type: 'members',
  })

  if (ownProjectMembersDescriptor) {
    return updateDescriptorForMembers(userSession, {
      env,
      project,
      type: 'members',
      name: 'members',
      membersDescriptor: ownProjectMembersDescriptor,
    })
  }

  if (origin) {
    if (env) {
      const envMembersDescriptor = await getDescriptor(userSession, {
        project,
        env,
        type: 'members',
        origin,
      })

      if (envMembersDescriptor) {
        return updateDescriptorForMembers(userSession, {
          env,
          project,
          type: 'members',
          name: 'members',
          membersDescriptor: envMembersDescriptor,
        })
      }
    }

    const projectMembersDescriptor = await getDescriptor(userSession, {
      project,
      type: 'members',
      origin,
    })

    if (projectMembersDescriptor) {
      return updateDescriptorForMembers(userSession, {
        project,
        type: 'members',
        name: 'members',
        membersDescriptor: projectMembersDescriptor,
      })
    }
  }

  throw new Error(`No descriptor found for project=${project} env=${env}`)
}

module.exports = {
  getLatestDescriptorByPath,
  getLatestProjectDescriptor,
  getLatestEnvDescriptor,
  getLatestMembersDescriptor,
  getOwnDescriptor,
  uploadDescriptorForEveryone,
  createDescriptor,
  getDescriptor,
  removeDescriptorForMembers,
  updateDescriptorForMembers,
  updateDescriptor,
  extractMembersByRole,
  getAdmins,
  getMembers,
  getAdminsAndContributors,
  isAdmin,
  mergeContents,
}
