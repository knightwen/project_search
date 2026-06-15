function cleanValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function escapeXml(value) {
  return cleanValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getProjectCoordinates(row) {
  const rawLatitude = cleanValue(row.Latitude);
  const rawLongitude = cleanValue(row.Longitude);
  if (!rawLatitude || !rawLongitude) {
    return null;
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

export function googleMapsUrl(row) {
  const coordinates = getProjectCoordinates(row);
  if (!coordinates) {
    return "";
  }
  return `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`;
}

export function projectLabel(row) {
  const projectId = cleanValue(row["Project ID"]);
  const projectName = cleanValue(row["Project Name"]);
  if (projectId && projectName) {
    return `${projectId} - ${projectName}`;
  }
  return projectName || projectId || "Selected project";
}

export function safeKmlName(row) {
  const projectId = cleanValue(row["Project ID"]);
  const projectName = cleanValue(row["Project Name"]);
  let baseName = [projectId, projectName].filter(Boolean).join(" ");
  if (!baseName) {
    baseName = "selected_project";
  }
  const safeName = baseName
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
    .replace(/^[ ._]+|[ ._]+$/g, "");
  return `${safeName.slice(0, 80)}.kml`;
}

export function projectKml(row) {
  const coordinates = getProjectCoordinates(row);
  if (!coordinates) {
    return null;
  }

  const name = projectLabel(row);
  const descriptionColumns = [
    "Project ID",
    "Client",
    "Manager",
    "Industry/Sector",
    "Key Words",
    "Description",
  ];
  const description = descriptionColumns
    .map((column) => {
      const value = cleanValue(row[column]);
      if (!value) {
        return "";
      }
      return `<b>${escapeXml(column)}</b>: ${escapeXml(value)}`;
    })
    .filter(Boolean)
    .join("<br/>")
    .replaceAll("]]>", "]]&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Placemark>
      <name>${escapeXml(name)}</name>
      <description><![CDATA[${description}]]></description>
      <Point>
        <coordinates>${coordinates.longitude},${coordinates.latitude},0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>
`;
}

export function projectsKml(rows, documentName = "Search Results") {
  const placemarks = rows
    .map((row) => {
      const coordinates = getProjectCoordinates(row);
      if (!coordinates) {
        return "";
      }

      const name = projectLabel(row);
      const descriptionColumns = [
        "Project ID",
        "Client",
        "Manager",
        "Industry/Sector",
        "Key Words",
        "Description",
      ];
      const description = descriptionColumns
        .map((column) => {
          const value = cleanValue(row[column]);
          if (!value) {
            return "";
          }
          return `<b>${escapeXml(column)}</b>: ${escapeXml(value)}`;
        })
        .filter(Boolean)
        .join("<br/>")
        .replaceAll("]]>", "]]&gt;");

      return `    <Placemark>
      <name>${escapeXml(name)}</name>
      <description><![CDATA[${description}]]></description>
      <Point>
        <coordinates>${coordinates.longitude},${coordinates.latitude},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
${placemarks}
  </Document>
</kml>
`;
}
