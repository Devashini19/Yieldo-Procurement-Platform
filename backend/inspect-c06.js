import store from "./data/store.js";

const c06Farmers = store.allFarmers().filter((f) => f.centreId === "C06");
console.log("=== ALL C06 FARMERS ===");
console.log(`Total at C06: ${c06Farmers.length}`);
c06Farmers.forEach((f) => {
  console.log({
    id: f.id,
    name: f.name,
    phone: f.phone,
    crop: f.crop,
    status: f.status,
    slotDate: f.slotDate,
    slotTime: f.slotTime,
    queueType: f.queueType,
  });
});
