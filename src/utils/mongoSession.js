'use strict';

const { ProtoUtils, Curve, generateRegistrationId } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');

const AuthSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    data: { type: String, required: true }
});

// منع إعادة تعريف الموديل إذا كان موجوداً بالفعل
const AuthModel = mongoose.models.Auth || mongoose.model('Auth', AuthSchema);

const useMongoDBAuthState = async (mongoUri) => {
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri, { 
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000 
            });
            console.log('Successfully connected to MongoDB');
        }
    } catch (err) {
        console.error('CRITICAL: MongoDB Connection Failed:', err.message);
        return null; // سيؤدي هذا إلى العودة لاستخدام الجلسة المحلية في connection.js
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
            console.error(`Error reading data for ${id}:`, error.message);
            return null;
        }
    };

    const writeData = async (id, data) => {
        try {
            const str = JSON.stringify(data, (key, value) => {
                if (Buffer.isBuffer(value)) {
                    return { type: 'Buffer', data: value.toJSON().data };
                }
                return value;
            });
            await AuthModel.findOneAndUpdate({ id }, { data: str }, { upsert: true });
        } catch (error) {
            console.error(`Error writing data for ${id}:`, error.message);
        }
    };

    const removeData = async (id) => {
        try {
            await AuthModel.deleteOne({ id });
        } catch (error) {
            console.error(`Error removing data for ${id}:`, error.message);
        }
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
