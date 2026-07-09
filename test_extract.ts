import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";

async function testExtract() {
  const formData = new FormData();
  const imageBuffer = fs.readFileSync("uploads/dispatch/dispatch-1783596241284-502506583.jpg");
  formData.append("file", imageBuffer, "dispatch-1783596241284-502506583.jpg");

  try {
    const res = await fetch("http://217.217.249.153:8001/v1/dispatch/extract", {
      method: "POST",
      headers: { 
        ...formData.getHeaders(),
        "x-api-key": "test"
      },
      body: formData,
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}
testExtract();
