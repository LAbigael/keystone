const conflictedDescriptors = {
  base: {
    content: [
      'NODE_ENV=dev',
      'SEND_MAIL=false',
      '',
      'GOOGLE_APPLICATION_CREDENTIALS_FILE=config/dev/dev-datastore-credentials.json',
      '',
      'LOGIN_SALT=$2b$10$K7I4ahLkUpv1CWxeWrvPGO',
      'JWT_SECRET=jwtjsonsecretdedev',
      'JWT_TOKEN_EXPIRE_TIME=',
      '',
      'GCLOUD_DATASTORE_NAMESPACE=your-namespace',
      'GCLOUD_PROJECT=your-google-project-id',
      'GCLOUD_QUEUE=your-queue-name',
      'GCLOUD_LOCATION=europe-west1',
      'GCLOUD_APPENGINE_SERVICE=your-appengine-service',
    ].join('\n'),
    version: 1,
  },

  left: {
    content: [
      'NODE_ENV=dev-test',
      'SEND_MAIL=true',
      '',
      'GOOGLE_APPLICATION_CREDENTIALS_FILE=config/dev/dev-datastore-credentials.json',
      '',
      'LOGIN_SALT=$2b$10$K7I4ahLkUpv1CWxeWrvPGO',
      'JWT_SECRET=jwtjsonsecretdedev',
      'JWT_TOKEN_EXPIRE_TIME=',
      '',
      'GCLOUD_DATASTORE_NAMESPACE=your-namespace',
      'GCLOUD_PROJECT=your-google-project-id',
      'GCLOUD_LOCATION=europe-west3',
      'GCLOUD_APPENGINE_SERVICE=your-appengine-service',
    ].join('\n'),
    version: 2,
  },
  right: {
    content: [
      'NODE_ENV=dev',
      'SEND_MAIL=false',
      '',
      'GOOGLE_APPLICATION_CREDENTIALS_FILE=config/dev/dev-datastore-credentials.json',
      '',
      'LOGIN_SALT=$2b$10$K7I4ahLkUpv1CWxeWrvPGO',
      'JWT_SECRET=jwtjsonsecretdedev',
      'JWT_TOKEN_EXPIRE_TIME=',
      '',
      'GCLOUD_DATASTORE_NAMESPACE=your-namespace-dev',
      'GCLOUD_PROJECT=your-google-project-id',
      'GCLOUD_QUEUE=your-queue-name',
      'GCLOUD_LOCATION=europe-west2',
      'GCLOUD_APPENGINE_SERVICE=your-appengine-service',
    ].join('\n'),
    version: 2,
  },
}

const conflictLessDescriptors = {
  base: {
    content: [
      'NODE_ENV=dev',
      'SEND_MAIL=false',
      '',
      'GOOGLE_APPLICATION_CREDENTIALS_FILE=config/dev/dev-datastore-credentials.json',
      '',
      'LOGIN_SALT=$2b$10$K7I4ahLkUpv1CWxeWrvPGO',
      'JWT_SECRET=jwtjsonsecretdedev',
      'JWT_TOKEN_EXPIRE_TIME=',
      '',
      'GCLOUD_DATASTORE_NAMESPACE=your-namespace',
      'GCLOUD_PROJECT=your-google-project-id',
      'GCLOUD_QUEUE=your-queue-name',
      'GCLOUD_LOCATION=europe-west1',
      'GCLOUD_APPENGINE_SERVICE=your-appengine-service',
    ].join('\n'),
    version: 1,
  },
  left: {
    content: [
      'NODE_ENV=dev-test',
      'SEND_MAIL=true',
      '',
      'GOOGLE_APPLICATION_CREDENTIALS_FILE=config/dev/dev-datastore-credentials.json',
      '',
      'LOGIN_SALT=$2b$10$K7I4ahLkUpv1CWxeWrvPGO',
      'JWT_SECRET=jwtjsonsecretdedev',
      'JWT_TOKEN_EXPIRE_TIME=',
      '',
      'GCLOUD_DATASTORE_NAMESPACE=your-namespace',
      'GCLOUD_PROJECT=your-google-project-id',
      'GCLOUD_QUEUE=your-queue-name',
      'GCLOUD_LOCATION=europe-west1',
      'GCLOUD_APPENGINE_SERVICE=your-appengine-service',
    ].join('\n'),
    version: 2,
  },
  right: {
    content: [
      'NODE_ENV=dev',
      'SEND_MAIL=false',
      '',
      'GOOGLE_APPLICATION_CREDENTIALS_FILE=config/dev/dev-datastore-credentials.json',
      '',
      'LOGIN_SALT=$2b$10$K7I4ahLkUpv1CWxeWrvPGO',
      'JWT_SECRET=jwtjsonsecretdedev',
      'JWT_TOKEN_EXPIRE_TIME=10000',
      '',
      'GCLOUD_DATASTORE_NAMESPACE=your-namespace-2',
      'GCLOUD_PROJECT=your-google-project-id',
      'GCLOUD_QUEUE=your-queue-name',
      'GCLOUD_LOCATION=europe-west2',
      'GCLOUD_APPENGINE_SERVICE=your-appengine-service',
    ].join('\n'),
    version: 2,
  },
}
module.exports = { conflictedDescriptors, conflictLessDescriptors }
