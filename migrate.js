// // // migrate.js
// // const { connectToDB, propertiesCollection } = require("./index.js");

// // async function addAdvertisedField() {
// //   await connectToDB();

// //   const result = await propertiesCollection.updateMany(
// //     { advertised: { $exists: false } },
// //     { $set: { advertised: false } }
// //   );

// //   console.log(`${result.modifiedCount} properties updated`);
// //   process.exit(0);
// // }

// // addAdvertisedField();

// const { connectToDB, getPropertiesCollection } = require("./index");

// async function addAdvertisedField() {
//   await connectToDB();
//   const propertiesCollection = getPropertiesCollection(); // now safe to access

//   const result = await propertiesCollection.updateMany(
//     { advertised: { $exists: false } },
//     { $set: { advertised: false } }
//   );

//   console.log(`${result.modifiedCount} properties updated`);
//   process.exit(0);
// }

// addAdvertisedField();

const { connectToDB, getPropertiesCollection } = require("./index");

async function addAdvertisedField() {
  await connectToDB();
  const propertiesCollection = getPropertiesCollection();

  const result = await propertiesCollection.updateMany(
    { advertised: { $exists: false } },
    { $set: { advertised: false } }
  );

  console.log(`${result.modifiedCount} properties updated`);
}

module.exports = { addAdvertisedField }; // ✅ just export, don't call
