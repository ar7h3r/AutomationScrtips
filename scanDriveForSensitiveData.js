function scanDriveForSensitiveData() {
  // Configure
  var folderId = ""; // leave empty to scan entire Drive, or put a folder ID
  var emailRecipient = Session.getActiveUser().getEmail();

  // Regex patterns
  var patterns = {
    "Credit Card": /\b(?:\d[ -]*?){13,16}\b/g,
    "SSN": /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
    "Phone Number": /(?:\+?\d{1,3})?[-. (]?\d{3}[-. )]?\d{3}[-.]?\d{4}/g,
    "Email": /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "AWS Key": /AKIA[0-9A-Z]{16}/g,
    "Salary": /\b(?:salary|compensation|pay rate|annual income|wage)\b[\s:]*\$?\d{2,6}(?:,\d{3})*(?:\.\d{2})?/gi,
    "Disciplinary Action": /\b(?:disciplinary action|warning|suspension|termination|reprimand|performance improvement plan)\b/gi
  };

  var results = [];

  // Get files
  var files = folderId ? DriveApp.getFolderById(folderId).getFiles() : DriveApp.getFiles();

  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    var fileType = file.getMimeType();
    var textContent = "";

    try {
      if (fileType === MimeType.GOOGLE_DOCS) {
        textContent = DocumentApp.openById(file.getId()).getBody().getText();
      } else if (fileType === MimeType.GOOGLE_SHEETS) {
        var sheet = SpreadsheetApp.openById(file.getId());
        sheet.getSheets().forEach(function(s) {
          textContent += s.getDataRange().getDisplayValues().join("\n");
        });
      } else if (fileType === MimeType.PDF) {
        // PDF: Use Drive API OCR to extract text
        var blob = file.getBlob();
        var resource = {
          title: fileName,
          mimeType: MimeType.GOOGLE_DOCS
        };
        var ocrFile = Drive.Files.insert(resource, blob, {ocr: true});
        var docId = ocrFile.id;
        textContent = DocumentApp.openById(docId).getBody().getText();
        // Clean up temp Google Doc
        DriveApp.getFileById(docId).setTrashed(true);
      }
      // Run regex checks
      for (var label in patterns) {
        var matches = textContent.match(patterns[label]);
        if (matches && matches.length > 0) {
          results.push(fileName + " (" + label + "): " + matches.slice(0, 3).join(", "));
        }
      }
    } catch (e) {
      // Skip files that can't be opened
      Logger.log("Skipped " + fileName + ": " + e.message);
    }
  }

  // Build report
  var report = results.length > 0 ? results.join("\n") : "✅ No sensitive data patterns detected.";
  
  // Email report
  MailApp.sendEmail({
    to: emailRecipient,
    subject: "Google Drive Sensitive Data Scan Report",
    body: report
  });

  Logger.log("Scan completed. Report sent to " + emailRecipient);
}