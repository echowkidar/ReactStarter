import fs from "fs";
import path from "path";

async function testOCR() {
  const formData = new globalThis.FormData();
  const imageBuffer = fs.readFileSync("uploads/dispatch/dispatch-1783596241284-502506583.jpg");
  formData.append(
    "file",
    new globalThis.Blob([imageBuffer], { type: "image/jpeg" }),
    "dispatch-1783596241284-502506583.jpg"
  );
  try {
    const res = await globalThis.fetch("http://217.217.249.153:8001/ocr", {
      method: "POST",
      headers: { Authorization: "Bearer test" },
      body: formData as any,
    });
    const text = await res.text();
    console.log("OCR API Response Status:", res.status);
    console.log("OCR API Response Body:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}
testOCR();
