import { PublicClientApplication, Configuration } from '@azure/msal-node';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    // Testing 'common' if the specific tenant is failing
    authority: `https://login.microsoftonline.com/common`,
  }
};

const pca = new PublicClientApplication(msalConfig);

async function diagnose() {
  console.log("Starting Azure Auth Diagnosis...");
  console.log("Client ID:", process.env.AZURE_CLIENT_ID);
  console.log("Tenant ID:", process.env.AZURE_TENANT_ID);
  console.log("Authority:", msalConfig.auth.authority);

  // Test with ONLY Mail.Read first to see if it's a scope combination issue
  const testScopes = ['Mail.Read'];
  
  console.log("\nAttempting acquireTokenByDeviceCode with Mail.Read:", testScopes);
  
  try {
    const response = await pca.acquireTokenByDeviceCode({
      scopes: testScopes,
      deviceCodeCallback: (response) => {
        console.log("\n✅ SUCCESS: Initial device code request succeeded!");
        console.log("RAW RESPONSE:", JSON.stringify(response, null, 2));
        
        // Let it poll for a few seconds to see if it fails immediately
        setTimeout(() => {
          console.log("\nStill polling... (Exit manually if needed or visit the URI)");
        }, 5000);
      }
    });
    console.log("\n✅ FINAL SUCCESS: Token obtained!");
    console.log("Access Token Start:", response.accessToken.substring(0, 10));
  } catch (err: any) {
    console.error("\n❌ FAILED:");
    console.error("Error Code:", err.errorCode);
    console.error("Error Message:", err.errorMessage);
    console.error("Sub Error:", err.subError);
    console.error("Correlation ID:", err.correlationId);
    
    if (err.errorMessage.includes('invalid_grant')) {
      console.log("\n💡 SUGGESTION: 'invalid_grant' with Device Code Flow usually means:");
      console.log("1. 'Allow public client flows' is NOT set to 'Yes' in the Azure Portal (Authentication tab).");
      console.log("2. The Client ID is registered as a Web App instead of a Public Client (Native/Desktop).");
      console.log("3. The Scopes requested are not configured in your App Registration. Go to 'API permissions' and add Microsoft Graph permissions.");
      console.log("4. The Tenant ID is incorrect for your account type.");
    }
  }
}

diagnose();
