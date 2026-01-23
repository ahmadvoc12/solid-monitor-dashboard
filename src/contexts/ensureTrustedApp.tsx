// lib/solid/ensureTrustedApp.ts

import {
  getSolidDataset,
  getThing,
  setThing,
  addUrl,
  saveSolidDatasetAt,
  buildThing,
  createThing,
  getSourceUrl,
  getUrlAll,
  getThingAll
} from "@inrupt/solid-client";
import { Session } from "@inrupt/solid-client-authn-browser";

export async function ensureTrustedApp(session: Session, appOrigin: string) {
  const webId = session.info.webId;
  if (!webId) return;

  const profileDataset = await getSolidDataset(webId, { fetch: session.fetch });
  let profileThing = getThing(profileDataset, webId);
  if (!profileThing) return;

  const trustedAppThings = getThingAll(profileDataset);
  const isAlreadyTrusted = trustedAppThings.some((thing) => {
    const origins = getUrlAll(thing, "http://www.w3.org/ns/auth/acl#origin");
    return origins.includes(appOrigin);
  });

  if (isAlreadyTrusted) {
    console.log(`✅ Origin ${appOrigin} sudah dipercaya`);
    return;
  }

  const trustedAppThing = buildThing(createThing())
    .addUrl("http://www.w3.org/ns/auth/acl#origin", appOrigin)
    .addUrl("http://www.w3.org/ns/auth/acl#mode", "http://www.w3.org/ns/auth/acl#Read")
    .addUrl("http://www.w3.org/ns/auth/acl#mode", "http://www.w3.org/ns/auth/acl#Write")
    .addUrl("http://www.w3.org/ns/auth/acl#mode", "http://www.w3.org/ns/auth/acl#Control")
    .build();

  const updatedDataset = setThing(profileDataset, trustedAppThing);
  profileThing = addUrl(profileThing, "http://www.w3.org/ns/auth/acl#trustedApp", trustedAppThing.url);
  const finalDataset = setThing(updatedDataset, profileThing);

  const targetUrl = getSourceUrl(profileDataset);
  if (!targetUrl) return;

  await saveSolidDatasetAt(targetUrl, finalDataset, { fetch: session.fetch });
  console.log(`✅ TrustedApp (${appOrigin}) berhasil ditambahkan ke ${webId}`);
}
