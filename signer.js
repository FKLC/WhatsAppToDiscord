const crypto = require('crypto');
const fs = require('fs');


const pk = process.env.PK;
const passphrase = process.env.PK_PASSPHRASE;

const buildPath = 'build/';

const createSignature = (file) => {
	const data = fs.readFileSync(buildPath + file);
	const signature = crypto.sign('RSA-SHA256', data, {
		key: pk,
		passphrase: passphrase,
	});
	fs.writeFileSync(buildPath + file + '.sig', signature);
};

fs.readdirSync(buildPath).forEach(file => {
	createSignature(file);
});
