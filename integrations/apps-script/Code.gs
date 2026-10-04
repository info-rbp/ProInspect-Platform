const PROINSPECT_TABS = {
  'booking.created': 'Bookings',
  'document_request.created': 'Requests',
  'client_request.created': 'Requests',
  'tenant_request.created': 'Requests',
  'work_order.created': 'Work Orders',
  'work_order.updated': 'Work Orders',
  'report.issued': 'Reports'
};
const PROINSPECT_HEADERS = ['Event ID','Event Type','Occurred At','Entity ID','Property ID','Client ID','Tenancy ID','Payload JSON','Received At'];

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function safeString_(value) {
  return value === undefined || value === null ? '' : String(value);
}
function constantEqual_(a, b) {
  a=safeString_(a); b=safeString_(b);
  if (a.length !== b.length) return false;
  var diff=0;
  for (var i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function sheetForEvent_(book, eventType) {
  var name=PROINSPECT_TABS[eventType] || 'Events';
  var sheet=book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,PROINSPECT_HEADERS.length).setValues([PROINSPECT_HEADERS]);
  return sheet;
}
function upsertEvent_(sheet, event) {
  var last=sheet.getLastRow();
  var row=0;
  if(last>1) {
    var hit=sheet.getRange(2,1,last-1,1).createTextFinder(event.eventId).matchEntireCell(true).findNext();
    if(hit) row=hit.getRow();
  }
  var values=[[
    event.eventId,event.eventType,event.occurredAt,event.entityId,
    safeString_(event.propertyId),safeString_(event.clientId),safeString_(event.tenancyId),
    JSON.stringify(event.payload || {}),new Date().toISOString()
  ]];
  if(row) sheet.getRange(row,1,1,values[0].length).setValues(values);
  else { sheet.appendRow(values[0]); row=sheet.getLastRow(); }
  return row;
}
function doPost(e) {
  var lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body=JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var properties=PropertiesService.getScriptProperties();
    var expected=properties.getProperty('PROINSPECT_INTEGRATION_TOKEN') || '';
    if(!expected || !constantEqual_(body.token, expected)) return jsonResponse_({ok:false,error:'unauthorised'});
    var event=body.event || {};
    if(!/^evt_[a-f0-9]{32}$/.test(safeString_(event.eventId)) || !event.eventType || !event.entityId || !event.occurredAt) {
      return jsonResponse_({ok:false,error:'invalid_event'});
    }
    var spreadsheetId=properties.getProperty('PROINSPECT_SPREADSHEET_ID') || '';
    if(!spreadsheetId) return jsonResponse_({ok:false,error:'spreadsheet_not_configured'});
    var book=SpreadsheetApp.openById(spreadsheetId);
    var sheet=sheetForEvent_(book,event.eventType);
    var row=upsertEvent_(sheet,event);
    SpreadsheetApp.flush();
    return jsonResponse_({ok:true,eventId:event.eventId,row:sheet.getName()+'!'+row});
  } catch (error) {
    console.error(error);
    return jsonResponse_({ok:false,error:'processing_failed'});
  } finally {
    lock.releaseLock();
  }
}
function configureProInspect(spreadsheetId, integrationToken) {
  if(!spreadsheetId || !integrationToken) throw new Error('Spreadsheet ID and integration token are required.');
  PropertiesService.getScriptProperties().setProperties({
    PROINSPECT_SPREADSHEET_ID: spreadsheetId,
    PROINSPECT_INTEGRATION_TOKEN: integrationToken
  }, false);
  setupProInspectWorkbook();
}
function setupProInspectWorkbook() {
  var id=PropertiesService.getScriptProperties().getProperty('PROINSPECT_SPREADSHEET_ID');
  if(!id) throw new Error('PROINSPECT_SPREADSHEET_ID is not configured.');
  var book=SpreadsheetApp.openById(id);
  ['Bookings','Requests','Work Orders','Reports','Events'].forEach(function(name){
    var sheet=book.getSheetByName(name) || book.insertSheet(name);
    if(sheet.getLastRow()===0) sheet.getRange(1,1,1,PROINSPECT_HEADERS.length).setValues([PROINSPECT_HEADERS]);
    sheet.setFrozenRows(1);
  });
}
