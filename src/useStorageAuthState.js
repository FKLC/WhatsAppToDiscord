/* eslint-disable */
const initAuthCreds =  require("@adiwajshing/baileys").initAuthCreds;
const WAProto_1 =  require("@adiwajshing/baileys/WAProto/index.js");
const generics_1 =  require("@adiwajshing/baileys/lib/Utils/generics.js");
const storage =  require("./storage.js");


const dbAuthName = 'baileyAuth';
const KEY_MAP = {
  'pre-key': 'preKeys',
  session: 'sessions',
  'sender-key': 'senderKeys',
  'app-state-sync-key': 'appStateSyncKeys',
  'app-state-sync-version': 'appStateVersions',
  'sender-key-memory': 'senderKeyMemory',
};

module.exports = async (newSession) => {
  let creds;
  let keys = {};

  const saveState = () => {
    storage.upsert(dbAuthName, JSON.stringify({ creds, keys }, generics_1.BufferJSON.replacer));
  };

  const authData = await storage.get(dbAuthName);
  if (authData && !newSession) {
    ({ creds, keys } = JSON.parse(authData, generics_1.BufferJSON.reviver));
  } else {
    creds = initAuthCreds();
    keys = {};
  }

  return {
    authState: {
      creds,
      keys: {
        get: (type, ids) => {
          const key = KEY_MAP[type];
          return ids.reduce((dict, id) => {
            let _a;
            let value = (_a = keys[key]) === null || _a === void 0 ? void 0 : _a[id];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              dict[id] = value;
            }
            return dict;
          }, {});
        },
        set: (data) => {
          for (const _key in data) {
            const key = KEY_MAP[_key];
            keys[key] = keys[key] || {};
            Object.assign(keys[key], data[_key]);
          }
          saveState();
        },
      },
    },
    saveState,
  };
};