import { createMatchServer } from "./createMatchServer.js";

const PORT = Number(process.env.PORT) || 8787;

createMatchServer(PORT).then(({ port }) => {
  console.log(`FLOORWARS match server listening on :${port}`);
});
