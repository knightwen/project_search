import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getProjectCoordinates,
  googleMapsUrl,
  projectsKml,
  projectKml,
  projectLabel,
  safeKmlName,
} from "./kml.js";

describe("KML and map helpers", () => {
  it("returns numeric coordinates only when both latitude and longitude are valid", () => {
    assert.deepEqual(getProjectCoordinates({ Latitude: "-31.95", Longitude: "115.86" }), {
      latitude: -31.95,
      longitude: 115.86,
    });
    assert.equal(getProjectCoordinates({ Latitude: "-31.95", Longitude: "" }), null);
  });

  it("builds project labels and Google Maps URLs", () => {
    const row = { "Project ID": "8443", "Project Name": "Treendale Wall", Latitude: -31.95, Longitude: 115.86 };

    assert.equal(projectLabel(row), "8443 - Treendale Wall");
    assert.equal(googleMapsUrl(row), "https://www.google.com/maps/search/?api=1&query=-31.95,115.86");
  });

  it("builds escaped one-project KML", () => {
    const kml = projectKml({
      "Project ID": "8443",
      "Project Name": "Treendale & Wall",
      Client: "A&B Client",
      Manager: "Michael",
      Latitude: -31.95,
      Longitude: 115.86,
      Description: "Use <certification>",
    });

    assert.match(kml, /<name>8443 - Treendale &amp; Wall<\/name>/);
    assert.match(kml, /<coordinates>115.86,-31.95,0<\/coordinates>/);
    assert.match(kml, /A&amp;B Client/);
    assert.match(kml, /Use &lt;certification&gt;/);
  });

  it("builds safe KML file names", () => {
    assert.equal(
      safeKmlName({ "Project ID": "8443", "Project Name": "Wall: Test/Area" }),
      "8443 Wall_ Test_Area.kml",
    );
  });

  it("builds one KML document for all rows with valid coordinates", () => {
    const kml = projectsKml(
      [
        {
          "Project ID": "8443",
          "Project Name": "Treendale Wall",
          Client: "Calibre",
          Latitude: -31.95,
          Longitude: 115.86,
        },
        {
          "Project ID": "1200",
          "Project Name": "No coordinates",
          Latitude: "",
          Longitude: "",
        },
        {
          "Project ID": "1300",
          "Project Name": "Bridge & Survey",
          Latitude: -32.1,
          Longitude: 116.2,
        },
      ],
      "Search Results",
    );

    assert.match(kml, /<name>Search Results<\/name>/);
    assert.equal((kml.match(/<Placemark>/g) || []).length, 2);
    assert.match(kml, /<name>8443 - Treendale Wall<\/name>/);
    assert.match(kml, /<coordinates>115.86,-31.95,0<\/coordinates>/);
    assert.match(kml, /<name>1300 - Bridge &amp; Survey<\/name>/);
    assert.doesNotMatch(kml, /No coordinates/);
  });
});
