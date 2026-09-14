const { uploadPhotos } = require("./controllers/listings/upload");
const req = {
  files: [
    { originalname: "test.jpg", path: "test.jpg" }
  ],
  user: { role: "owner" }
};
const res = {
  status: (code) => {
    console.log("status:", code);
    return res;
  },
  json: (data) => {
    console.log("json:", data);
  }
};
const fs = require("fs");
fs.writeFileSync("test.jpg", "hello");
uploadPhotos(req, res).then(() => {
  console.log("done");
  fs.unlinkSync("test.jpg");
}).catch(console.error);
