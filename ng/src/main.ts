import { getBootstrapState } from "./status.js";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("NG shell mount point is missing");
}

const heading = document.createElement("h1");
heading.textContent = "Amy's Echo NG";

const message = document.createElement("p");
message.textContent = "Neuer Kommunikationsbereich. Die Bedienoberfläche folgt in S1.";

root.replaceChildren(heading, message);
root.dataset.bootstrap = getBootstrapState();
