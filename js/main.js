

/*-----------------------------------------------------------------------------
* Jsdataframe
*/

var jd = jsdataframe;
jd.printingOpts.setMaxWidth(120);


/*-----------------------------------------------------------------------------
* Constants
*/

var VERSION = '1.0.0';

var NUM_HIST_BINS = 40;
var UI_DEBOUNCE_MILLIS = 100;

var DATA_PREVIEW_NUM_ROWS = 100;


/*-----------------------------------------------------------------------------
* Global application state
*/

var appState = {
  dataBundle: null,
  _derivedDf: null,

  ndx: null,
  dimMap: null,
  groupMap: null,

  dcjsCounter: 0,
  dcjsChartGroup: null,

  dataPreviewHot: null,
  varSettingsHot: null,
};

// Loads a new data bundle and refreshes the entire app state
appState.setDataBundle = function(dataBundle) {
  this.dataBundle = dataBundle;
  this._derivedDf = support.computeDerivedDf(dataBundle.dataset);
  this.renderDataPreview(dataBundle.dataset.head(DATA_PREVIEW_NUM_ROWS));
  this.renderVarSettingsDf(dataBundle.settingsObj.varDf);
  this.renderDcjsWithSettings(dataBundle.settingsObj);
};

// Renders the handsontable data preview using the given data frame
appState.renderDataPreview = function(df) {
  var previewDf = df.updateCols(function(v) {
    return v.toDtype('string');
  });
  if (this.dataPreviewHot !== null) {
    // Clean up previous handsontable
    this.dataPreviewHot.destroy();
    $('#dataPreviewHot').empty();
  }
  this.dataPreviewHot = new Handsontable($('#dataPreviewHot')[0], {
    data: previewDf.toMatrix(),
    rowHeaders: true,
    colHeaders: previewDf.names().values,
    readOnly: true,
    manualColumnResize: true,
  });
};

// Renders the handsontable variable settings data frame
appState.renderVarSettingsDf = function(varDf) {
  if (this.varSettingsHot !== null) {
    // Clean up previous handsontable
    this.varSettingsHot.destroy();
    $('#varSettingsHot').empty();
  }
  var colHotSettings = varDf.names().values.map(function(colName) {
    return colName === 'Column Name' ? {readOnly: true} : {};
  });
  this.varSettingsHot = new Handsontable($('#varSettingsHot')[0], {
    data: varDf.toMatrix(),
    rowHeaders: false,
    colHeaders: varDf.names().values,
    manualColumnResize: true,
    preventOverflow: 'horizontal',
    columns: colHotSettings,
  });
};

// Extracts the current variable settings from the handsontable
// and uses them to re-render all dc.js charts
appState.applyCurrentSettings = function() {
  var varDf = jd.dfFromMatrix(this.varSettingsHot.getData());
  varDf = varDf.setNames(this.varSettingsHot.getColHeader());
  varDf = varDf.updateCols(jd.ex(0), function(v) {
    return v.toDtype('number');
  });
  var settingsObj = this.dataBundle.settingsObj;
  settingsObj.varDf = varDf;
  this.renderVarSettingsDf(varDf);
  this.renderDcjsWithSettings(settingsObj);
};

// Saves the given settings and refreshes all dc.js charts
appState.renderDcjsWithSettings = function(settingsObj) {
  this.dataBundle.settingsObj = settingsObj;

  if (this.ndx !== null) {
    // Clean up previous crossfilter structures and dc.js charts
    _.values(this.groupMap).forEach(function(group) {
      group.dispose();
    });
    _.values(this.dimMap).forEach(function(dim) {
      dim.dispose();
    });
    $('#dcjsContainer').empty();
  }

  // Create new chart group string
  this.dcjsCounter++;
  var dcjsChartGroup = this.dcjsChartGroup = this.dcjsCounter.toString();

  // Compile crossfilter object array
  var ndxObjArray = this._compileNdxObjArray();

  // Create settings map for dc.js
  var dcjsSettingsMap = this._compileDcjsSettingsMap();

  // Construct crossfilter objects and dc.js charts
  var ndx = this.ndx = crossfilter(ndxObjArray);
  var dimMap = this.dimMap = {};
  var groupMap = this.groupMap = {};

  var dimColNames = jd.vCat(
    this._derivedDf.names(),
    this.dataBundle.dataset.names().s(jd.ex(0))
  ).values;
  var $dcjsContainer = $('#dcjsContainer');

  dimColNames.forEach(function(dimCol, chartIndex) {
    var settings = dcjsSettingsMap[dimCol];
    settings.chartTitle = dimCol;
    settings.dcjsChartGroup = dcjsChartGroup;

    dimMap[dimCol] = ndx.dimension(function(d) { return d[dimCol]; });
    if (settings.roundInterval) {
      groupMap[dimCol] = dimMap[dimCol].group(function(value) {
        return support.roundTo(value, settings.roundInterval);
      }).reduceCount();
    } else {
      groupMap[dimCol] = dimMap[dimCol].group().reduceCount();
    }

    var chartId = 'dcjsChart_' + dcjsChartGroup + '_' + chartIndex;

    var $chartDiv = $('<div>')
      .attr('id', chartId)
      .appendTo($dcjsContainer);
    support.createDcjsChart(
      $chartDiv, dimMap[dimCol], groupMap[dimCol], settings);
  });

  // Create data counts
  groupMap._all = ndx.groupAll();
  dc.dataCount('#dcjsCount', dcjsChartGroup)
    .dimension(ndx)
    .group(groupMap._all);
  dc.dataCount('#dcjsCountSidebar', dcjsChartGroup)
    .dimension(ndx)
    .group(groupMap._all);

  // Render all charts
  dc.renderAll(dcjsChartGroup);
};

appState._compileNdxObjArray = function() {
  var df = this.dataBundle.dataset;
  var varDf = this.dataBundle.settingsObj.varDf;

  // Replace missing values
  df = df.updateCols(jd.byDtype('number'), function(vector, colName) {
    var replacementValue =
      varDf.locAt('Column Name', colName, 'NaN Substitute');
    return vector.replaceNa(replacementValue);
  });

  // Combine with derived columns
  df = jd.colCat(
    df.s(null, 0),  // date column
    this._derivedDf,  // date derived columns
    df.s(null, jd.ex(0))   // numeric variable columns
  );

  return df.toObjArray();
};

appState._compileDcjsSettingsMap = function() {
  var settingsMap = support.initDerivedDcjsSettings(this._derivedDf);
  var varDf = this.dataBundle.settingsObj.varDf;
  var varColNames = this.dataBundle.dataset.names().s(jd.ex(0)).values;

  varColNames.forEach(function(varCol) {
    var settings = support.defaultSettings();
    settings.gap = -1;
    settings.centerBar = true;

    // Determine clean xRange and rounding interval
    var domain = [
      varDf.locAt('Column Name', varCol, 'Display Min'),
      varDf.locAt('Column Name', varCol, 'Display Max')
    ];
    var ticks = d3.scale.linear()
      .domain(domain)
      .nice(NUM_HIST_BINS)
      .ticks(NUM_HIST_BINS);
    settings.xRange = d3.extent(ticks);
    var interval = ticks[1] - ticks[0];
    settings.roundInterval = interval;
    settings.xUnits = function(start, end, xDomain) {
      return Math.abs(end - start) / interval;
    };

    settingsMap[varCol] = settings;
  });

  return settingsMap;
};


/*-----------------------------------------------------------------------------
* On document ready
*/

$(document).ready(function() {

  var initDate = new Date();

  // Load Data
  arraybuffer = atob(data_bundle.zip);   // bpa_totals loaded from bpa_totals.jsonp
  var dataBundle = support.unpackBundle(arraybuffer, true);
  appState.setDataBundle(dataBundle);


  // Wire up buttons
  $('#dcjsResetAll').click(function() {
    dc.filterAll(appState.dcjsChartGroup);
    dc.redrawAll(appState.dcjsChartGroup);
  });

  $('#downloadSelection').click(function() {
    var df = jd.dfFromObjArray(support.extractSelected(appState.ndx));
    df = df.updateCols(jd.byDtype('date'), function(v) {
      return v.toDtype('string');
    });
    support.downloadCsv(df);
  });

  support.wireFileUpload('loadBundle', 'loadBundleFile', function() {
    var file = $('#loadBundleFile')[0].files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      var arraybuffer = reader.result;
      var dataBundle = support.unpackBundle(arraybuffer);
      appState.setDataBundle(dataBundle);
    };
    reader.readAsArrayBuffer(file);
  });

  support.wireFileUpload('importCsv', 'importCsvFile', function() {
    var file = $('#importCsvFile')[0].files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = reader.result;
      var dataBundle = {};
      dataBundle.dataset = support.parseCsvStr(text);
      dataBundle.settingsObj = support.initSettingsObj(dataBundle.dataset);
      appState.setDataBundle(dataBundle);
    };
    reader.readAsText(file);
  });

  $('#applyDataSettings').click(function() {
    appState.applyCurrentSettings();
  });

  $('#saveDataBundle').click(function() {
    appState.applyCurrentSettings();
    var bundleObj = support.packBundle(appState.dataBundle);
    support.downloadBundle(bundleObj);
  });


  // Display app version
  $('.app-version').text('Version ' + VERSION);


  $(window).resize(_.debounce(function() {
    appState.dataPreviewHot.updateSettings({
      width: 'auto'
    });
    // console.log($('#dataPreviewHot').width());
  }, UI_DEBOUNCE_MILLIS));


  var seconds = (new Date() - initDate) / 1e3;
  var alertText = 'Loaded data in ' +
    (Math.round(seconds * 10) / 10) +
    ' seconds';
  // alert(alertText);
});
