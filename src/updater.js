const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { pipeline } = require('stream/promises');
const { spawn } = require('node:child_process');
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

const downloadLatestVersion = async (executableName) => {
	await pipeline(
		(await fetch('https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/' + executableName)).body,
		fs.createWriteStream(executableName),
	);
};

const validateSignature = async (executableName) => {
	return crypto.verify(
		'RSA-SHA256',
		fs.readFileSync(executableName),
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
		const executableName = getExecutableName();
		if (!executableName) {
			console.log('Auto-update is not supported on this platform: ' + os.platform());
			return false;
		}
		await new Promise(resolve => fs.rename(executableName, executableName + '.oldVersion', resolve));
		await downloadLatestVersion(executableName);
		if (await validateSignature(executableName)) {
			console.log('Couldn\'t verify the signature of the updated binary, reverting back. Please update manually.');
			await new Promise(resolve => fs.unlink(executableName, resolve));
			await new Promise(resolve => fs.rename(executableName + '.oldVersion', executableName, resolve));
			return false;
		}
		await new Promise(resolve => fs.unlink(executableName + '.oldVersion', resolve));
		return executableName;
	},
};