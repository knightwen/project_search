import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getProjectCoordinates,
  googleMapsUrl,
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
});
