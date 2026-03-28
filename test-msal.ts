import { PublicClientApplication, Configuration } from '@azure/msal-node';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'd:/somma/.env' });

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3, // Info
    }
  }
};
const pca = new PublicClientApplication(msalConfig);

const tokenRequest = {
  scopes: ['Mail.Read', 'Mail.Send', 'Tasks.ReadWrite', 'User.Read', 'offline_access'],
};

pca.acquireTokenByDeviceCode({
  ...tokenRequest,
  deviceCodeCallback: (response) => {
    console.log("RESPONSE RECEIVED:");
    console.log(response);
    process.exit(0);
  }
}).then(console.log).catch(console.error);
