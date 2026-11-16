import type { Dict } from "../types";

export const record: Dict["record"] = {
  openApp: "ऐप खोलें",
  title: "भुगतान रिकॉर्ड",
  intro:
    "हर सर्कल लिखता है कि कोई वॉलेट कैसे भुगतान करता है: कितने महीने समय पर, कितने लोन चुकाए, कितने डिफ़ॉल्ट। यह ब्लॉकचेन पर रहता है, कोई इसे बदल नहीं सकता, और इसे न बेचा जा सकता है न किसी दूसरे वॉलेट में भेजा जा सकता है।",
  addressLabel: "वॉलेट का पता",
  addressPlaceholder: "वॉलेट का पता, 0x…",
  lookUp: "देखें",
  notAnAddress: "यह वॉलेट का पता नहीं है।",
  pasteAddress: "कोई वॉलेट पता डालें, या अपना रिकॉर्ड देखने के लिए ऐप में अपना वॉलेट जोड़ें।",
  notLive: "WealthKart अभी इस नेटवर्क पर शुरू नहीं हुआ है।",
  reading: "रिकॉर्ड पढ़ा जा रहा है",
  region: "रिकॉर्ड",
  locked: "इसी वॉलेट से जुड़ा है",
  monthsOnTime: "समय पर भरे महीने",
  monthsLate: "देर से भरे महीने",
  circles: "सर्कल",
  loansRepaid: "चुकाए गए लोन",
  defaults: "डिफ़ॉल्ट",
  since: "कब से",

  none: "अभी कोई रिकॉर्ड नहीं है।",
  onTime_one: "{count} महीने में से {pct}% समय पर भरा",
  onTime_other: "{count} महीनों में से {pct}% समय पर भरे",
  repaid_one: "{count} लोन चुकाया",
  repaid_other: "{count} लोन चुकाए",
  noDefaults: "कोई डिफ़ॉल्ट नहीं",
  defaultCount_one: "{count} डिफ़ॉल्ट",
  defaultCount_other: "{count} डिफ़ॉल्ट",
  across_one: "{parts}, {count} सर्कल में।",
  across_other: "{parts}, {count} सर्कलों में।",
};
