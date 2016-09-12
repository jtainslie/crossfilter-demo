
/*-----------------------------------------------------------------------------
* Helper functions
*/

var support = (function() {

var support = {};

// Round a number to the nearest interval boundary
support.roundTo = function(number, interval) {
  return Math.round(number / interval) * interval;
};

// Compute dimension data frame derived from the date column
support.computeDerivedDf = function(dataset) {
  var dateCol = dataset.c(0);
  var objArray = dateCol.values.map(function(date) {
    return {
      YearMonth: d3.time.month(date),
      Year: +d3.time.format('%Y')(date),
      Month: +d3.time.format('%m')(date),
      Weekday: +d3.time.format('%w')(date),
      Hour: +d3.time.format('%H')(date),
    };
  });
  var derivedNames = ['YearMonth', 'Year', 'Month', 'Weekday', 'Hour'];
  var result = jd.dfFromObjArray(objArray).s(null, derivedNames);
  return result;
};

// Returns an object containing default variable settings
support.defaultSettings = function() {
  return {
    chartType: 'barChart',
    width: 243,
    height: 200,
  };
};

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Returns a map of dc.js settings for derived date dimensions
support.initDerivedDcjsSettings = function(derivedDf) {
  var result = {};

  result.YearMonth = support.defaultSettings();
  result.YearMonth.width = 729;
  result.YearMonth.height = 100;
  result.YearMonth.xRange = [
    derivedDf.c('YearMonth').min(),
    d3.time.month.ceil(+derivedDf.c('YearMonth').max() + 1)
  ];
  result.YearMonth.dtype = 'date';
  result.YearMonth.gap = 1;
  result.YearMonth.showRange = true;
  result.YearMonth.yTicks = 3;

  result.Year = support.defaultSettings();
  result.Year.chartType = 'pieChart';

  result.Month = support.defaultSettings();
  result.Month.chartType = 'pieChart';

  result.Weekday = support.defaultSettings();
  result.Weekday.chartType = 'rowChart';
  result.Weekday.colors = [
    '#e6550d',
    '#3182bd',
    '#6baed6',
    '#9ecae1',
    '#bda9cc',
    '#9989a6',
    // '#a1d99b',
    // '#74c476',
    '#fd8d3c',
  ];
  result.Weekday.labelOffsetY = 12;
  result.Weekday.labelFunc = function(d) {
    return WEEKDAYS[d.key];
  };

  result.Hour = support.defaultSettings();
  result.Hour.xRange = [0, 24];
  result.Hour.xTickValues = jd.seq(0, 24, 4, true).values;

  return result;
};

// Create a dc.js chart using the given jQuery-wrapped div ($chartDiv),
// dimension, group, and settings
support.createDcjsChart = function($chartDiv, dim, group, settings) {
  // Add supporting DOM elements
  $('<strong>')
    .text(settings.chartTitle)
    .prepend('&nbsp;')
    .attr('style', 'font-size: 110%')
    .appendTo($chartDiv);
  $chartDiv.append('&nbsp;');
  if (settings.showRange) {
    $chartDiv.append('\n');
    $('<span>')
      .addClass('reset')
      .attr('style', 'display: none')
      .text('range: ')
      .append($('<span>').addClass('filter'))
      .appendTo($chartDiv);
  }
  $chartDiv.append('\n');
  var $reset = $('<a>')
    .attr('href', '#')
    .addClass('reset')
    .attr('style', 'display: none')
    .text('reset')
    .appendTo($chartDiv);
  $('<div>')
    .addClass('clearfix')
    .appendTo($chartDiv);

  // Create chart object
  var chartId = $chartDiv.attr('id');
  var chart = dc[settings.chartType]('#' + chartId, settings.dcjsChartGroup)
    .dimension(dim)
    .group(group);

  $reset.click(function(e) {
    chart.filterAll();
    dc.redrawAll(settings.dcjsChartGroup);
    e.preventDefault();
  });

  // Configure chart
  switch (settings.chartType) {
    case 'barChart':
      support.configBarChart(chart, settings);
      break;
    case 'pieChart':
      support.configPieChart(chart, settings);
      break;
    case 'rowChart':
      support.configRowChart(chart, settings);
      break;
    default:
      throw new Error('unexpected chart type: ' + settings.chartType);
  }

  return chart;
};

// Configure a barChart using the given settings
support.configBarChart = function(chart, settings) {
  chart.width(settings.width)
    .height(settings.height)
    .elasticY(true)
    .margins({top: 10, right: 40, bottom: 30, left: 40})
    ;
  if (settings.dtype === 'date') {
    chart.x(d3.time.scale().domain(settings.xRange))
      .round(d3.time.month.round)
      .xUnits(d3.time.months);
  } else {
    chart.x(d3.scale.linear().domain(settings.xRange));
    chart.xAxis()
      .ticks(5)
      .tickFormat(d3.format('s'));
  }
  if (settings.xTickValues) {
    chart.xAxis().tickValues(settings.xTickValues);
  }
  if (settings.xUnits) {
    chart.xUnits(settings.xUnits);
  }
  if (typeof settings.gap !== 'undefined') {
    chart.gap(settings.gap);
  }
  if (typeof settings.centerBar !== 'undefined') {
    chart.centerBar(settings.centerBar);
  }
  var yTicks = settings.yTicks || 5;
  chart.yAxis()
    .ticks(yTicks)
    .tickFormat(d3.format('s'));
};

// Configure a pieChart using the given settings
support.configPieChart = function(chart, settings) {
  chart.width(settings.width)
    .height(settings.height)
    .radius(98)
    .innerRadius(25)
    .minAngleForLabel(0.4)
    ;
};

// Configure a rowChart using the given settings
support.configRowChart = function(chart, settings) {
  chart.width(settings.width)
    .height(settings.height)
    .margins({top: 10, right: 40, bottom: 30, left: 40})
    .elasticX(true);
  if (settings.colors) {
    chart.colors(settings.colors);
  }
  if (settings.labelFunc) {
    chart.label(settings.labelFunc);
  }
  if (typeof settings.labelOffsetY !== 'undefined') {
    chart.labelOffsetY(settings.labelOffsetY);
  }
  chart.xAxis()
    .ticks(5)
    .tickFormat(d3.format('s'));
};


var MOMENTJS_PARSE_FORMATS = [
  'M/D/YYYY',
  'M/D/YYYY H:m',
  'M/D/YYYY H:m:s',
  'M/D/YYYY h:m A',
  'M/D/YYYY h:m:s A'
];

// Uses Moment.js to parse a string into a JavaScript Date.
// If no "/" character is detected, the string is assumed to be ISO 8601.
// Otherwise, the special formats in MOMENTJS_PARSE_FORMATS are used
// assuming local time.
// Returns null if the date is invalid.
support.parseDateStr = function(dateStr) {
  var result;
  if (dateStr.indexOf('/') === -1) {
    result = moment(dateStr).toDate();
  } else {
    result = moment(dateStr, MOMENTJS_PARSE_FORMATS).toDate();
  }
  var dateIsInvalid = result.getTime() !== result.getTime();
  return dateIsInvalid ? null : result;
};

// Wires up a button to fire a click event on the file input and
// execute the given handler upon selection of a file
support.wireFileUpload = function(buttonId, fileInputId, handler) {
  $('#' + fileInputId).change(handler);
  $('#' + buttonId).click(function() {
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      $('#' + fileInputId)[0].click();
    } else {
      alert('Your browser does not support the necessary File APIs.');
    }
  });
};

// Parses a CSV string into a data frame.
support.parseCsvStr = function(csvStr) {
  var df = jd.dfFromMatrixWithHeader(d3.csv.parseRows(csvStr));
  var dateVec = df.c(0).map(support.parseDateStr).toDtype('date');
  df = df.cMod(0, dateVec);
  df = df.s(dateVec.isNa().not());
  df = df.updateCols(jd.ex(0), function(vector) {
    return vector.map(function(x) {
      return x.trim() === '' ? NaN : +x;
    });
  });
  return df;
};

// Initialize settings object based on the given dataset
support.initSettingsObj = function(dataset) {
  var dataset2 = dataset.s(null, jd.ex(0));  // drop datetime column
  var df = dataset2.mapCols(function(v) { return [v.min(), v.max()]; });
  df = jd.colCat({metric: ['Display Min', 'Display Max']}, df);
  df = df.transpose('Column Name', 'metric');
  df = jd.colCat(df, {'NaN Substitute': 0});
  return {
    varDf: df,
  };
};



// Reducing functions for "extractSelected"
var extractReduceAdd = function(p, v) {
  p.push(v);
  return p;
};
var extractReduceInitial = function() {
  return [];
};
var extractReduceRemove = extractReduceInitial;

// Extract an array of all records selected for the crossfilter dimension
// (as indicated by the "groupAll" method).
// The crossfilter object itself can be passed as "dim" to observe all filters.
support.extractSelected = function(dim) {
  var allGroup = dim.groupAll()
    .reduce(extractReduceAdd, extractReduceRemove, extractReduceInitial);
  var result = allGroup.value();
  allGroup.dispose();
  return result;
};

// Download a data frame to a CSV
support.downloadCsv = function(df) {
  var csvStr = d3.csv.formatRows(df.toMatrix(true));
  saveAs(new Blob([csvStr], {type: 'text/csv'}), 'data.csv');
};

// Packs a data bundle object for saving
support.packBundle = function(dataBundle) {
  settingsObj = _.clone(dataBundle.settingsObj);
  settingsObj.varDf = settingsObj.varDf.pack();
  return {
    type: 'crossfilterBundle',
    version: VERSION,
    dataset: dataBundle.dataset.pack(),
    settingsObj: settingsObj,
  };
};

// Unpacks an ArrayBuffer containing a zipped bundle
support.unpackBundle = function(arraybuffer, assumeAscii) {
  var zip = new JSZip(arraybuffer);
  var jsonStr = !assumeAscii ?
    zip.file('data.json').asText() :
    zip.file('data.json').asBinary();  // use "asBinary" for performance if we assume ASCII
  var result = JSON.parse(jsonStr);
  if (result.type !== 'crossfilterBundle') {
    throw new Error('unrecognized bundle contents');
  }
  result.dataset = jd.unpack(result.dataset);
  result.settingsObj.varDf = jd.unpack(result.settingsObj.varDf);
  return result;
};

// JSON stringify, zip, and download the given object
support.downloadBundle = function(object) {
  var zip = new JSZip();
  zip.file('data.json', JSON.stringify(object));
  var blob = zip.generate({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {level: 9},
  });
  saveAs(blob, 'bundle.zip');
};

// Same as "downloadBundle" except the result is base64 encoded
// and returned in a JSON file
support.downloadJsonBundle = function(object) {
  var zip = new JSZip();
  zip.file('data.json', JSON.stringify(object));
  var b64Str = zip.generate({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: {level: 9},
  });
  var jsonStr = JSON.stringify({zip: b64Str});
  saveAs(new Blob([jsonStr], {type: 'application/json'}), 'bundle.json');
};

return support;
})();
