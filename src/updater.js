const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { pipeline } = require('stream/promises');
const fetch = require('node-fetch');


const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArwZEUsgdgeAmr5whnpsO
hvdp222eepTpxp23GmrOdXHnSDitSaU8St9ViKDUOlEWOx+61Y3DpBetycgFcawz
bKFxm2UNwMqW/8sg/cvh8BGJ2IGor8etC6KRUclDLvtzCl8j95S9tIzBBheVRLx9
+RtLNyzZBzn9GTZXdlO368u34fHrCYwoEFJfTXbEb2LnlbMGyjo4C/We6xWmRVEz
XoygOglAgJYuQjpCfjUhfcP/bOh/mLOgpX0kuJzp/0dSMx4qvJhBPe7fGXesGJQ9
x+cgcRR8fzN9gowrhltAb73PFYECiOYFYQS8bHMJX/jcQiYKqUuQCWS/wcbkYz+s
OwIDAQAB
-----END PUBLIC KEY-----`;

const getExecutableName = () => {
	switch (os.platform()) {
	case 'linux':
		return 'WA2DC-Linux';
	case 'darwin':
		return 'WA2DC-macOS';
	case 'win32':
		return 'WA2DC.exe';
	default:
		return false;
	}
};

const getCurrentExecutableName = () => {
	return process.argv0.split(/[\/\\]/).pop();
};

const downloadLatestVersion = async (executableName, targetName) => {
	await pipeline(
		(await fetch('https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/' + executableName)).body,
		fs.createWriteStream(targetName),
	);
};

const validateSignature = async (currExecutableName, executableName) => {
	return crypto.verify(
		'RSA-SHA256',
		fs.readFileSync(currExecutableName),
		publicKey,
		Buffer.from(await (await fetch(`https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/${executableName}.sig`)).arrayBuffer()),
	);
};

module.exports = {
	update: async () => {
		if (process.argv0.replace('.exe', '').endsWith('node')) {
			console.log('Running script with node. Skipping auto-update.');
			return false;
		}
		const currExecutableName = getCurrentExecutableName();
		const executableName = getExecutableName();
		if (!executableName) {
			console.log('Auto-update is not supported on this platform: ' + os.platform());
			return false;
		}
		await fs.promises.rename(currExecutableName, currExecutableName + '.oldVersion');
		await downloadLatestVersion(executableName, currExecutableName);
		if (!await validateSignature(currExecutableName, executableName)) {
			console.log('Couldn\'t verify the signature of the updated binary, reverting back. Please update manually.');
			await fs.promises.unlink(currExecutableName);
			await fs.promises.rename(currExecutableName + '.oldVersion', currExecutableName);
			return false;
		}
		await fs.promises.unlink(currExecutableName + '.oldVersion').catch(() => null);
		return currExecutableName;
	},
	cleanOldVersion: async () => {
		await fs.promises.unlink(getCurrentExecutableName() + '.oldVersion').catch(() => null);
	},
};