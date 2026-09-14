import { google } from "googleapis";

const packageName = "com.traknio.app";

const auth = new google.auth.GoogleAuth({
  keyFile:
    "C:/Users/longi_vnjgmvk/Documents/Secrets/traknio-play-monitor-8695102e0254.json",
  scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});

const androidPublisher = google.androidpublisher({
  version: "v3",
  auth,
});

let editId = null;

try {
  console.log("Connexion à Google Play...");

  const edit = await androidPublisher.edits.insert({
    packageName,
    requestBody: {},
  });

  editId = edit.data.id;

  console.log("Lecture des tracks...");

  const tracksResponse = await androidPublisher.edits.tracks.list({
    packageName,
    editId,
  });

  const tracks = tracksResponse.data.tracks ?? [];

  if (tracks.length === 0) {
    console.log("Aucun track trouvé.");
  }

  for (const track of tracks) {
    console.log("\n==============================");
    console.log(`TRACK : ${track.track}`);
    console.log("==============================");

    const releases = track.releases ?? [];

    if (releases.length === 0) {
      console.log("Aucune release.");
      continue;
    }

    for (const release of releases) {
      console.log({
        name: release.name ?? null,
        status: release.status ?? null,
        versionCodes: release.versionCodes ?? [],
        userFraction: release.userFraction ?? null,
      });
    }
  }
} catch (error) {
  console.error("\nERREUR GOOGLE PLAY :");

  if (error?.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(error?.message ?? error);
  }

  process.exitCode = 1;
} finally {
  if (editId) {
    try {
      await androidPublisher.edits.delete({
        packageName,
        editId,
      });

      console.log("\nTransaction temporaire supprimée.");
    } catch (deleteError) {
      console.error(
        "\nImpossible de supprimer la transaction temporaire :",
        deleteError?.message ?? deleteError
      );
    }
  }
}