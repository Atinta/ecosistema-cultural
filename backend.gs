/*
  INSTRUCCIONES:
  1. Abre tu Google Sheet (la hoja original, no la versión publicada).
  2. Ve a 'Extensiones' -> 'Apps Script'.
  3. Pega este código reemplazando todo lo anterior.
  4. Identifica el ID de tu hoja: en la URL de tu navegador, es la cadena larga entre '/d/' y '/edit'.
     Ejemplo: https://docs.google.com/spreadsheets/d/ABC123XYZ/edit#gid=0 -> El ID es ABC123XYZ
  5. Cambia 'SPREADSHEET_ID' (abajo) por ese ID.
  6. Haz clic en 'Implementar' -> 'Nueva implementación'.
  7. Selecciona 'Aplicación web'.
  8. En 'Quién tiene acceso', elige 'Cualquiera' (esto es vital para que la web app funcione).
  9. Copia la URL generada y pégala en GOOGLE_SCRIPT_URL en el archivo app.js.
*/

const SPREADSHEET_ID = '1-S5NA31GzQIJ631B8M_5gg9yu-SDwTRGu91jPbB2coNLGhBVju33RTui2pYo5y2mAEt8M8GnHcISj4H'; // REEMPLAZA ESTO CON TU ID REAL
const PASS = "1234"; // Password simple para acciones destructivas

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.action === "addEdge") {
      const sheet = ss.getSheetByName("Relaciones"); // Asegúrate de que el nombre coincida
      sheet.appendRow([data.from, data.to, data.label, data.type]);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    if (data.action === "deleteNode") {
      if (data.password !== PASS) throw new Error("Acceso denegado");

      // Eliminar de Nodos
      const nodeSheet = ss.getSheetByName("Nodos");
      const nodeData = nodeSheet.getDataRange().getValues();
      for (let i = 1; i < nodeData.length; i++) {
        if (nodeData[i][0].toString() === data.id.toString()) {
          nodeSheet.deleteRow(i + 1);
          break;
        }
      }

      // Eliminar relaciones asociadas
      const relSheet = ss.getSheetByName("Relaciones");
      const relData = relSheet.getDataRange().getValues();
      for (let j = relData.length - 1; j >= 1; j--) {
        if (relData[j][0].toString() === data.id.toString() || relData[j][1].toString() === data.id.toString()) {
          relSheet.deleteRow(j + 1);
        }
      }
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    if (data.action === "addNode") {
      const sheet = ss.getSheetByName("Nodos");
      const nextId = new Date().getTime().toString(); // ID único simple
      sheet.appendRow([nextId, data.label, data.group, data.image || "", data.val_size || 25, data.bio || "", data.url || ""]);
      return ContentService.createTextOutput(nextId).setMimeType(ContentService.MimeType.TEXT);
    }

    if (data.action === "updateNode") {
      const sheet = ss.getSheetByName("Nodos");
      const nodeData = sheet.getDataRange().getValues();
      for (let i = 1; i < nodeData.length; i++) {
        if (nodeData[i][0].toString() === data.id.toString()) {
          // Columnas: ID(0), Label(1), Group(2), Image(3), Size(4), Bio(5), Url(6)
          sheet.getRange(i + 1, 2).setValue(data.label);
          sheet.getRange(i + 1, 3).setValue(data.group);
          sheet.getRange(i + 1, 6).setValue(data.bio);
          sheet.getRange(i + 1, 7).setValue(data.url);
          return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
        }
      }
      throw new Error("Nodo no encontrado");
    }

  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// Habilitar CORS para navegadores
function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}
