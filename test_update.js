// Script de prueba para verificar UPDATE
const query = `UPDATE clients 
 SET name = ?, companyName = ?, email = ?, phone = ?, address = ?, clientNumber = ?, priceType = ?, modifiedAt = ?, needsSync = 1
 WHERE id = ?`;

console.log("Query SQL:");
console.log(query);
console.log("\nColumnas que se actualizan:");
console.log("- name");
console.log("- companyName");
console.log("- email");
console.log("- phone");
console.log("- address");
console.log("- clientNumber");
console.log("- priceType");
console.log("- modifiedAt");
console.log("- needsSync");
console.log("\nColumnas que NO se actualizan:");
console.log("- companyTaxId");
console.log("- gpsLocation");
console.log("- city");
console.log("- state");
console.log("- zipCode");
console.log("- country");
console.log("- contactPerson");
