'use strict';

const { ProtoUtils, Curve, generateRegistrationId } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');

const AuthSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: String, required: true }
});

const AuthModel = mongoose.model('Auth', AuthSchema);

const useMongoDBAuthState = async (mongoUri) => {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri);
    }

    const readData = async (id) => {
        try {
            const res = await AuthModel.findOne({ id });
            if (!res) return null;
            return JSON.parse(res.data, (key, value) => {
                if (value && typeof value === 'object' && value.type === 'Buffer') {
                    return Buffer.from(value.data);
                }
                return value;
            });
        } catch (error) {
            return null;
        }
    };

    const writeData = async (id, data) => {
        const str = JSON.stringify(data, (key, value) => {
            if (Buffer.isBuffer(value)) {
                return { type: 'Buffer', data: value.toJSON().data };
            }
            return value;
        });
        await AuthModel.findOneAndUpdate({ id }, { data: str }, { upsert: true });
    };

    const removeData = async (id) => {
        await AuthModel.deleteOne({ id });
    };

    const creds = await readData('creds') || {
        registrationId: generateRegistrationId(),
        advSecretKey: Buffer.alloc(32),
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSettings: { unarchiveChats: false },
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = ProtoUtils.appStateSyncKey.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const type in data) {
                        for (const id in data[type]) {
                            const value = data[type][id];
                            const key = `${type}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
};

module.exports = { useMongoDBAuthState };
