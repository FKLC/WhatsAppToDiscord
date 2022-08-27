const Sequelize = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL || 'sqlite://storage.db', {
  logging: false,
  define: {
    timestamps: false,
    freezeTableName: true,
  },
});

const Storage = sequelize.define('WA2DC', {
  name: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  data: Sequelize.TEXT,
});

module.exports = {
  initializeDB: async () => {
    await Storage.sync();
  },
  upsert: async (name, data) => {
    await Storage.upsert({
      name,
      data,
    });
  },
  get: async (name) => {
    const result = await Storage.findOne({ where: { name } });
    if (result == null) {
      return null;
    }
    return result.get('data');
  },
};
