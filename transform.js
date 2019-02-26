const FILE_NAME = "february_partial_receipts";
const data = require(`./data/${FILE_NAME}.json`);
const moment = require("moment");
const fs = require("fs");
const {
  assign,
  has,
  flow,
  get,
  getOr,
  map,
  pick,
  reduce,
  values
} = require("lodash/fp");
const { mapValues } = require("lodash");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const TAX_TYPE_PER_TEAM = {
  cuisine: ["0060000", "0120000"],
  bar: ["0210000"]
};

// Everything before CUTOFHOUR:00 is considered
const NIGHT_CUTOFF_HOUR = 7;
const DAY_SHIFT_CUTOFF_HOUR = 17;

const isNightNextDay = dateTime => dateTime.hour() < NIGHT_CUTOFF_HOUR;
const isDayShift = dateTime =>
  !isNightNextDay(dateTime) && dateTime.hour() < DAY_SHIFT_CUTOFF_HOUR;
const getShiftDate = dateTime =>
  isNightNextDay(dateTime)
    ? dateTime
        .clone()
        .subtract(1, "day")
        .startOf("date")
    : dateTime.clone().startOf("date");
const getShift = dateTime => (isDayShift(dateTime) ? "jour" : "nuit");

const getReceiptList = get("receiptAggregates.receipts");
const pickDateAndTotalPerTaxRate = map(
  pick(["date", "receiptTotalPerTaxType"])
);
const getDateAndShiftFromTicketDateTime = ticketTimeString => ({
  shiftDate: getShiftDate(moment(ticketTimeString)),
  shift: getShift(moment(ticketTimeString))
});
const addShift = map(ticket =>
  assign(getDateAndShiftFromTicketDateTime(get("date")(ticket)), ticket)
);

const getTotalPerTeamFromReceiptTotalPerTaxType = receiptTotalPerTaxType =>
  mapValues(TAX_TYPE_PER_TEAM, taxTypeList =>
    reduce(
      (accumulator, taxType) =>
        accumulator +
        getOr(0, `${taxType}.taxInclusive`, receiptTotalPerTaxType),
      0,
      taxTypeList
    )
  );

const addTotalPerTeam = map(ticket =>
  assign(
    getTotalPerTeamFromReceiptTotalPerTaxType(
      get("receiptTotalPerTaxType")(ticket)
    ),
    ticket
  )
);

const aggOverTickets = reduce((acc, ticket) => {
  const shiftDate = get("shiftDate")(ticket);
  const shift = get("shift")(ticket);
  const key = `${shiftDate} # ${shift}`;
  if (has(key, acc)) {
    acc[key]["cuisine"] += ticket["cuisine"];
    acc[key]["bar"] += ticket["bar"];
  } else {
    acc[key] = pick(["cuisine", "bar", "shift", "shiftDate"])(ticket);
  }

  return acc;
}, {});

const addExcelFormattedDate = map(ticket => 
    assign(
      {
        shiftDateExcelFormat: ticket['shiftDate'].format('YYYY-MM-DD HH:mm:ss')
      },
      ticket
    )
  );

const transform = flow(
  getReceiptList,
  pickDateAndTotalPerTaxRate,
  addShift,
  addTotalPerTeam,
  aggOverTickets,
  addExcelFormattedDate,
  values
);

const csvWriter = createCsvWriter({
  path: `./data/${FILE_NAME}.csv`,
  header: [
    { id: 'shiftDateExcelFormat', title: 'shiftDateExcelFormat' },
    { id: "shiftDate", title: "shiftDate" },
    { id: "shift", title: "shift" },
    { id: "cuisine", title: "cuisine" },
    { id: "bar", title: "bar" }
  ]
});

csvWriter
  .writeRecords(transform(data)) // returns a promise
  .then(() => {
    console.log("...Done");
  });

// fs.writeFile(
//   './transformed.json',
//   JSON.stringify(transform(data), null, 2),
//   'utf8',
//   err => {
//     if (err) throw err;
//     console.log('The file has been written!');
//   }
// );
