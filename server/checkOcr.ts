import "dotenv/config";
import path from "path";
import { PDFNet } from "@pdftron/pdfnet-node";

const OCR_MODULE_PATH = path.resolve(process.cwd(), "apryse-ocr-module", "Lib");

async function main() {
  const licenseKey = process.env.APRYSE_LICENSE_KEY;
  if (!licenseKey) throw new Error("APRYSE_LICENSE_KEY not set");
  await PDFNet.runWithCleanup(async () => {
    console.log("PDFNet version:", await PDFNet.getVersion());
    console.log("OCR module path:", OCR_MODULE_PATH);
    console.log("available before addResourceSearchPath:", await PDFNet.OCRModule.isModuleAvailable());
    await PDFNet.addResourceSearchPath(OCR_MODULE_PATH);
    console.log("available after addResourceSearchPath:", await PDFNet.OCRModule.isModuleAvailable());
  }, licenseKey);
  await PDFNet.shutdown();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR", e);
    process.exit(1);
  });
