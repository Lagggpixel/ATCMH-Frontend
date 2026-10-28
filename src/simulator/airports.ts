import aviationData from "./data/aviation.json";
import kbhmLegacy from "./data/kbhm-before-runway-repair.json";
import kbhmBeforeApron from "./data/kbhm-before-apron-links.json";
import sbbrLegacy from "./data/sbbr-before-runway-repair.json";
import rjttLegacy from "./data/rjtt-before-runway-repair.json";
import cyycLegacy from "./data/cyyc-before-axis-repair.json";
import klasLegacy from "./data/klas-before-axis-repair.json";
import lgavLegacy from "./data/lgav-before-axis-repair.json";
import lgavBeforeStandRepair from "./data/lgav-before-stand-repair.json";
import lgavBeforeTaxilaneImport from "./data/lgav-before-taxilane-import.json";
import nzaaLegacy from "./data/nzaa-before-axis-repair.json";
import nzaaBeforeDomesticStandRepair from "./data/nzaa-before-domestic-stand-repair.json";
import roahLegacy from "./data/roah-before-axis-repair.json";
import scelLegacy from "./data/scel-before-axis-repair.json";
import scelBeforeStandImport from "./data/scel-before-stand-import.json";
import scelBeforeA02Dedup from "./data/scel-before-a02-dedup.json";
import {AIRPORT_RADIO_NAMES} from "./radio-identifiers";
import kase from "./data/kase.json";
import kaseBeforeStandImport from "./data/kase-before-stand-import.json";
import vnlk from "./data/vnlk.json";
import vnlkBeforeTaxiHoldClearance from "./data/vnlk-before-taxi-hold-clearance.json";
import vnlkBeforeStandImport from "./data/vnlk-before-stand-import.json";
import egph from "./data/egph.json";
import egphBefore15bDedup from "./data/egph-before-15b-dedup.json";
import egphBefore209Removal from "./data/egph-before-209-removal.json";
import egll from "./data/egll.json";
import egllBeforeT4StandRepair from "./data/egll-before-t4-stand-repair.json";
import egllBeforeStand422Repair from "./data/egll-before-stand-422-repair.json";
import kbhm from "./data/kbhm.json";
import kbhmBeforeC1Dedup from "./data/kbhm-before-c1-dedup.json";
import cyul from "./data/cyul.json";
import cyulBefore87aLink from "./data/cyul-before-87a-link.json";
import cyulBeforeTwoShortLinks from "./data/cyul-before-two-short-links.json";
import cyulBeforeTwelveApronConnectors from "./data/cyul-before-twelve-apron-connectors.json";
import cyulBeforeApronConnectors from "./data/cyul-before-apron-connectors.json";
import roah from "./data/roah.json";
import kdal from "./data/kdal.json";
import kdalBeforeApronLinks from "./data/kdal-before-apron-links.json";
import sbbr from "./data/sbbr.json";
import sbbrBefore1718Dedup from "./data/sbbr-before-17-18-dedup.json";
import sbbrBeforeTinyApronLinks from "./data/sbbr-before-tiny-apron-links.json";
import lfmn from "./data/lfmn.json";
import lfmnBefore33B39BReview from "./data/lfmn-before-33b-39b-review.json";
import lfmnBeforeElevenCheckpoints from "./data/lfmn-before-eleven-checkpoints.json";
import lfmnBefore35BChartReview from "./data/lfmn-before-35b-chart-review.json";
import lfmnBefore37BChartReview from "./data/lfmn-before-37b-chart-review.json";
import lfmnBefore56LRemoval from "./data/lfmn-before-56l-removal.json";
import lfmnBeforeStand37BRepair from "./data/lfmn-before-stand-37b-repair.json";
import lfmnBeforeStand17Repair from "./data/lfmn-before-stand-17-repair.json";
import lfmnBeforeOrientationRepair from "./data/lfmn-before-stand-orientation-repair.json";
import lfmnBefore2LRepair from "./data/lfmn-before-stand-2l-repair.json";
import lfmnBeforeFiveApronConnectors from "./data/lfmn-before-five-apron-connectors.json";
import lfmnBeforeExtraApronConnectors from "./data/lfmn-before-extra-apron-connectors.json";
import lfmnBeforeStand15Repair from "./data/lfmn-before-stand-15-repair.json";
import lfmnBeforeThreeCheckpoints from "./data/lfmn-before-three-stand-checkpoints.json";
import kont from "./data/kont.json";
import klas from "./data/klas.json";
import klasBeforeThree40mConnectors from "./data/klas-before-three-40m-connectors.json";
import klasBeforeThreeLongerConnectors from "./data/klas-before-three-longer-connectors.json";
import klasBeforeFiveEConnectors from "./data/klas-before-five-e-connectors.json";
import klasBeforeThreeApronConnectors from "./data/klas-before-three-apron-connectors.json";
import klasBeforeExtraOrientations from "./data/klas-before-extra-orientations.json";
import klasBeforeSixApronConnectors from "./data/klas-before-six-apron-connectors.json";
import klasBeforeTerminalOrientation from "./data/klas-before-terminal-orientation.json";
import lgav from "./data/lgav.json";
import phog from "./data/phog.json";
import phogBeforeStandImport from "./data/phog-before-stand-import.json";
import nzaa from "./data/nzaa.json";
import nzaaBefore48EBranchRepair from "./data/nzaa-before-48e-branch-repair.json";
import nzaaBeforeStand84Repair from "./data/nzaa-before-stand-84-repair.json";
import nzaaBeforeSharedBranches from "./data/nzaa-before-shared-branches.json";
import nzaaBeforeInternationalStandRepair from "./data/nzaa-before-international-stand-repair.json";
import nzaaBeforeStand5256Repair from "./data/nzaa-before-stand-52-56-repair.json";
import nzaaBeforeRemoteStandRepair from "./data/nzaa-before-remote-stand-repair.json";
import nzaaBeforeMoreDomesticStandRepair from "./data/nzaa-before-more-domestic-stand-repair.json";
import nzaaBeforeInternationalNodes from "./data/nzaa-before-international-nodes.json";
import nzaaBeforeRemote8081 from "./data/nzaa-before-remote-80-81.json";
import lbsf from "./data/lbsf.json";
import lbsfBeforeStands3538 from "./data/lbsf-before-stands-35-38.json";
import lbsfBeforeStands1734 from "./data/lbsf-before-stands-17-34.json";
import lbsfBeforeStands1216 from "./data/lbsf-before-stands-12-16.json";
import kjfk from "./data/kjfk.json";
import kjfkBeforeStandDedup from "./data/kjfk-before-stand-dedup.json";
import kjfkBeforeTerminal7Gate9 from "./data/kjfk-before-terminal7-gate9.json";
import kjfkBeforeJunctionRepair from "./data/kjfk-before-junction-repair.json";
import kbos from "./data/kbos.json";
import kbosBeforeStandDedup from "./data/kbos-before-stand-dedup.json";
import scel from "./data/scel.json";
import ebbr from "./data/ebbr.json";
import ebbrBeforeStandImport from "./data/ebbr-before-stand-import.json";
import ebbrBeforeExtraApronImport from "./data/ebbr-before-extra-apron-import.json";
import ebbrBeforeNineStandImport from "./data/ebbr-before-nine-stand-import.json";
import eddl from "./data/eddl.json";
import eddlBeforeA09A15Import from "./data/eddl-before-a09-a15-import.json";
import eddlBeforeSevenTerminalLinks from "./data/eddl-before-seven-terminal-links.json";
import eddlBeforeA07Import from "./data/eddl-before-a07-import.json";
import eddlBeforeB03B04Import from "./data/eddl-before-b03-b04-import.json";
import eddlBeforeStandImport from "./data/eddl-before-stand-import.json";
import eddlBeforeExtraStandImport from "./data/eddl-before-extra-stand-import.json";
import eddlBeforeInferredStandImport from "./data/eddl-before-inferred-stand-import.json";
import cyyc from "./data/cyyc.json";
import cyycBeforeStandImport from "./data/cyyc-before-stand-import.json";
import cyycBefore3738Links from "./data/cyyc-before-37-38-links.json";
import cyycBefore24Links from "./data/cyyc-before-2-4-links.json";
import cyycBeforeEightTerminalLinks from "./data/cyyc-before-eight-terminal-links.json";
import cyycBeforeFiveTerminalLinks from "./data/cyyc-before-five-terminal-links.json";
import cyycBeforeInternationalLinks from "./data/cyyc-before-international-links.json";
import cyycBeforeAdditionalFiveLinks from "./data/cyyc-before-additional-five-links.json";
import lime from "./data/lime.json";
import limeBeforeStandImport from "./data/lime-before-stand-import.json";
import kslc from "./data/kslc.json";
import kslcBeforeStandImport from "./data/kslc-before-stand-import.json";
import ksan from "./data/ksan.json";
import ksanBeforeStandImport from "./data/ksan-before-stand-import.json";
import ksanBeforeConnectorImport from "./data/ksan-before-connector-import.json";
import egss from "./data/egss.json";
import egssBeforeStandImport from "./data/egss-before-stand-import.json";
import tncm from "./data/tncm.json";
import tncmBeforeStandImport from "./data/tncm-before-stand-import.json";
import oakb from "./data/oakb.json";
import oakbBeforeStand20 from "./data/oakb-before-stand20.json";
import oakbBeforeApron4Stands from "./data/oakb-before-apron4-stands.json";
import lqsa from "./data/lqsa.json";
import lqsaBeforeStandImport from "./data/lqsa-before-stand-import.json";
import lqsaBeforeChartedAdditions from "./data/lqsa-before-charted-additions.json";
import edds from "./data/edds.json";
import eddsBeforeStandImport from "./data/edds-before-stand-import.json";
import eddsBeforeAdditionalStands from "./data/edds-before-additional-stands.json";
import ltfm from "./data/ltfm.json";
import ltfmBeforeChart4StandImport from "./data/ltfm-before-chart4-stand-import.json";
import ltfmBeforeChart123StandImport from "./data/ltfm-before-chart123-stand-import.json";
import eidw from "./data/eidw.json";
import eidwBeforeStandImport from "./data/eidw-before-stand-import.json";
import eidwBeforeExtraStandImport from "./data/eidw-before-extra-stand-import.json";
import eidwBeforeGapStandImport from "./data/eidw-before-gap-stand-import.json";
import eidwLegacy from "./data/eidw-2026-10-17.json";
import rjtt from "./data/rjtt.json";
import rjttBefore109113Import from "./data/rjtt-before-109-113-import.json";
import rjttBeforeStandImport from "./data/rjtt-before-stand-import.json";
import rjttBeforeTerminal3Import from "./data/rjtt-before-terminal3-import.json";
import rjttBeforeStand60Import from "./data/rjtt-before-stand60-import.json";
import rjttBeforeBranchStandImport from "./data/rjtt-before-branch-stand-import.json";
import rjttBeforeStand65Import from "./data/rjtt-before-stand65-import.json";
import {EXERCISE_WEATHER, type Aircraft, type Airport, type Frequency} from "./model";

export const AIRPORT_IDS = ["EGPH", "EGLL", "KBHM", "CYUL", "ROAH", "KDAL", "SBBR", "LFMN", "KONT", "KLAS", "LGAV", "PHOG", "NZAA", "LBSF", "KJFK", "KBOS", "SCEL", "EBBR", "EDDL", "CYYC", "LIME", "KSLC", "KSAN", "EGSS", "TNCM", "OAKB", "LQSA", "EDDS", "LTFM", "EIDW", "RJTT", "KASE", "VNLK"] as const;
export type AirportId = typeof AIRPORT_IDS[number];
export const airportData = {EGPH: egph, EGLL: egll, KBHM: kbhm, CYUL: cyul, ROAH: roah, KDAL: kdal, SBBR: sbbr, LFMN: lfmn, KONT: kont, KLAS: klas, LGAV: lgav, PHOG: phog, NZAA: nzaa, LBSF: lbsf, KJFK: kjfk, KBOS: kbos, SCEL: scel, EBBR: ebbr, EDDL: eddl, CYYC: cyyc, LIME: lime, KSLC: kslc, KSAN: ksan, EGSS: egss, TNCM: tncm, OAKB: oakb, LQSA: lqsa, EDDS: edds, LTFM: ltfm, EIDW: eidw, RJTT: rjtt, KASE: kase, VNLK: vnlk};
const snapshots: Record<AirportId, Airport> = {
  EGPH: {...egph, runways: [{...egph.runway, id: "06/24"}]},
  EGLL: {...egll, runway: egll.runways[0]}, KBHM: {...kbhm, runway: kbhm.runways[0]},
  CYUL: {...cyul, runway: cyul.runways[0]}, ROAH: {...roah, runway: roah.runways[0]},
  KDAL: {...kdal, runway: kdal.runways[0]}, SBBR: {...sbbr, runway: sbbr.runways[0]},
  LFMN: {...lfmn, runway: lfmn.runways[0]}, KONT: {...kont, runway: kont.runways[0]},
  KLAS: {...klas, runway: klas.runways[0]}, LGAV: {...lgav, runway: lgav.runways[0]},
  PHOG: {...phog, runway: phog.runways[0]}, NZAA: {...nzaa, runway: nzaa.runways[0]},
  LBSF: {...lbsf, runway: lbsf.runways[0]},
  KBOS: {...kbos, runway: kbos.runways[0]},
  SCEL: {...scel, runway: scel.runways[0]},
  EBBR: {...ebbr, runway: ebbr.runways[0]},
  EDDL: {...eddl, runway: eddl.runways[0]},
  CYYC: {...cyyc, runway: cyyc.runways[0]},
  LIME: {...lime, runway: lime.runways[0]},
  KSLC: {...kslc, runway: kslc.runways[0]},
  KSAN: {...ksan, runway: ksan.runways[0]},
  EGSS: {...egss, runway: egss.runways[0]},
  TNCM: {...tncm, runway: tncm.runways[0]},
  OAKB: {...oakb, runway: oakb.runways[0]},
  LQSA: {...lqsa, runway: lqsa.runways[0]},
  EDDS: {...edds, runway: edds.runways[0]},

  KJFK: {...kjfk, runway: kjfk.runways[0]},
  LTFM: {...ltfm, runway: ltfm.runways[0]},
  EIDW: {...eidw, runway: eidw.runways[0]},
  RJTT: {...rjtt, runway: rjtt.runways[0]},
  KASE: {...kase, runway: kase.runways[0]},
  VNLK: {...vnlk, runway: vnlk.runways[0]},
};
export const defaultAirport = snapshots.EGPH;
// Keep saved exercises on the geometry against which their positions were captured.
const legacyDublin: Airport = {...eidwLegacy, runway: eidwLegacy.runways[0]};
const legacyKbhmApron: Airport = {...kbhmBeforeApron, runway: kbhmBeforeApron.runways[0]};
const legacyRunways: Partial<Record<AirportId, Airport>> = Object.fromEntries(
  [kbhmLegacy, sbbrLegacy, rjttLegacy, cyycLegacy, klasLegacy, lgavLegacy, nzaaLegacy, roahLegacy, scelLegacy]
    .map(airport => [airport.icao, {...airport, runway: airport.runways[0]}]));
export type AirportSelection = {traffic?: readonly Pick<Aircraft,"destination">[];airport?: string; airportDataVersion?: string; trainingStation?: string; weather?: import("./model").ExerciseWeather; radarEnvironment?: import("./model").RadarEnvironment};
export function getAirport(selection: AirportSelection = {}): Airport {
  const id = selection.airport ?? "EGPH";
  if (!Object.hasOwn(snapshots, id)) throw new Error("This airport is not available.");
  const legacy = id === "CYUL" && selection.airportDataVersion === cyulBeforeTwoShortLinks.dataVersion
    ? {...cyulBeforeTwoShortLinks, runway: cyulBeforeTwoShortLinks.runways[0]}
    : id === "CYUL" && selection.airportDataVersion === cyulBefore87aLink.dataVersion
    ? {...cyulBefore87aLink, runway: cyulBefore87aLink.runways[0]}
    : id === "CYUL" && selection.airportDataVersion === cyulBeforeTwelveApronConnectors.dataVersion
    ? {...cyulBeforeTwelveApronConnectors, runway: cyulBeforeTwelveApronConnectors.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeThree40mConnectors.dataVersion
    ? {...klasBeforeThree40mConnectors, runway: klasBeforeThree40mConnectors.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBefore33B39BReview.dataVersion
    ? {...lfmnBefore33B39BReview, runway: lfmnBefore33B39BReview.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeElevenCheckpoints.dataVersion
    ? {...lfmnBeforeElevenCheckpoints, runway: lfmnBeforeElevenCheckpoints.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBefore48EBranchRepair.dataVersion
    ? {...nzaaBefore48EBranchRepair, runway: nzaaBefore48EBranchRepair.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeThreeLongerConnectors.dataVersion
    ? {...klasBeforeThreeLongerConnectors, runway: klasBeforeThreeLongerConnectors.runways[0]}
    : id === "VNLK" && selection.airportDataVersion === vnlkBeforeTaxiHoldClearance.dataVersion
    ? {...vnlkBeforeTaxiHoldClearance, runway: vnlkBeforeTaxiHoldClearance.runways[0]}
    : id === "OAKB" && selection.airportDataVersion === oakbBeforeStand20.dataVersion
    ? {...oakbBeforeStand20, runway: oakbBeforeStand20.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBefore35BChartReview.dataVersion
    ? {...lfmnBefore35BChartReview, runway: lfmnBefore35BChartReview.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBefore37BChartReview.dataVersion
    ? {...lfmnBefore37BChartReview, runway: lfmnBefore37BChartReview.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBefore56LRemoval.dataVersion
    ? {...lfmnBefore56LRemoval, runway: lfmnBefore56LRemoval.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeFiveEConnectors.dataVersion
    ? {...klasBeforeFiveEConnectors, runway: klasBeforeFiveEConnectors.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeStand37BRepair.dataVersion
    ? {...lfmnBeforeStand37BRepair, runway: lfmnBeforeStand37BRepair.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeThreeApronConnectors.dataVersion
    ? {...klasBeforeThreeApronConnectors, runway: klasBeforeThreeApronConnectors.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeStand84Repair.dataVersion
    ? {...nzaaBeforeStand84Repair, runway: nzaaBeforeStand84Repair.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeSharedBranches.dataVersion
    ? {...nzaaBeforeSharedBranches, runway: nzaaBeforeSharedBranches.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeExtraOrientations.dataVersion
    ? {...klasBeforeExtraOrientations, runway: klasBeforeExtraOrientations.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeSixApronConnectors.dataVersion
    ? {...klasBeforeSixApronConnectors, runway: klasBeforeSixApronConnectors.runways[0]}
    : id === "KLAS" && selection.airportDataVersion === klasBeforeTerminalOrientation.dataVersion
    ? {...klasBeforeTerminalOrientation, runway: klasBeforeTerminalOrientation.runways[0]}
    : id === "OAKB" && selection.airportDataVersion === oakbBeforeApron4Stands.dataVersion
    ? {...oakbBeforeApron4Stands, runway: oakbBeforeApron4Stands.runways[0]}
    : id === "LBSF" && selection.airportDataVersion === lbsfBeforeStands3538.dataVersion
    ? {...lbsfBeforeStands3538, runway: lbsfBeforeStands3538.runways[0]}
    : id === "LBSF" && selection.airportDataVersion === lbsfBeforeStands1734.dataVersion
    ? {...lbsfBeforeStands1734, runway: lbsfBeforeStands1734.runways[0]}
    : id === "CYUL" && selection.airportDataVersion === cyulBeforeApronConnectors.dataVersion
    ? {...cyulBeforeApronConnectors, runway: cyulBeforeApronConnectors.runways[0]}
    : id === "LBSF" && selection.airportDataVersion === lbsfBeforeStands1216.dataVersion
    ? {...lbsfBeforeStands1216, runway: lbsfBeforeStands1216.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeThreeCheckpoints.dataVersion
    ? {...lfmnBeforeThreeCheckpoints, runway: lfmnBeforeThreeCheckpoints.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeStand15Repair.dataVersion
    ? {...lfmnBeforeStand15Repair, runway: lfmnBeforeStand15Repair.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeExtraApronConnectors.dataVersion
    ? {...lfmnBeforeExtraApronConnectors, runway: lfmnBeforeExtraApronConnectors.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeFiveApronConnectors.dataVersion
    ? {...lfmnBeforeFiveApronConnectors, runway: lfmnBeforeFiveApronConnectors.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBefore2LRepair.dataVersion
    ? {...lfmnBefore2LRepair, runway: lfmnBefore2LRepair.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeOrientationRepair.dataVersion
    ? {...lfmnBeforeOrientationRepair, runway: lfmnBeforeOrientationRepair.runways[0]}
    : id === "KJFK" && selection.airportDataVersion === kjfkBeforeJunctionRepair.dataVersion
    ? {...kjfkBeforeJunctionRepair, runway: kjfkBeforeJunctionRepair.runways[0]}
    : id === "KJFK" && selection.airportDataVersion === kjfkBeforeTerminal7Gate9.dataVersion
    ? {...kjfkBeforeTerminal7Gate9, runway: kjfkBeforeTerminal7Gate9.runways[0]}
    : id === "KBHM" && selection.airportDataVersion === kbhmBeforeC1Dedup.dataVersion
    ? {...kbhmBeforeC1Dedup, runway: kbhmBeforeC1Dedup.runways[0]}
    : id === "KDAL" && selection.airportDataVersion === kdalBeforeApronLinks.dataVersion
    ? {...kdalBeforeApronLinks, runway: kdalBeforeApronLinks.runways[0]}
    : id === "SBBR" && selection.airportDataVersion === sbbrBeforeTinyApronLinks.dataVersion
    ? {...sbbrBeforeTinyApronLinks, runway: sbbrBeforeTinyApronLinks.runways[0]}
    : id === "SBBR" && selection.airportDataVersion === sbbrBefore1718Dedup.dataVersion
    ? {...sbbrBefore1718Dedup, runway: sbbrBefore1718Dedup.runways[0]}
    : id === "LFMN" && selection.airportDataVersion === lfmnBeforeStand17Repair.dataVersion
    ? {...lfmnBeforeStand17Repair, runway: lfmnBeforeStand17Repair.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeRemote8081.dataVersion
    ? {...nzaaBeforeRemote8081, runway: nzaaBeforeRemote8081.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeInternationalNodes.dataVersion
    ? {...nzaaBeforeInternationalNodes, runway: nzaaBeforeInternationalNodes.runways[0]}
    : id === "VNLK" && selection.airportDataVersion === vnlkBeforeStandImport.dataVersion
    ? {...vnlkBeforeStandImport, runway: vnlkBeforeStandImport.runways[0]}
    : id === "KASE" && selection.airportDataVersion === kaseBeforeStandImport.dataVersion
    ? {...kaseBeforeStandImport, runway: kaseBeforeStandImport.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeMoreDomesticStandRepair.dataVersion
    ? {...nzaaBeforeMoreDomesticStandRepair, runway: nzaaBeforeMoreDomesticStandRepair.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeRemoteStandRepair.dataVersion
    ? {...nzaaBeforeRemoteStandRepair, runway: nzaaBeforeRemoteStandRepair.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeStand5256Repair.dataVersion
    ? {...nzaaBeforeStand5256Repair, runway: nzaaBeforeStand5256Repair.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeInternationalStandRepair.dataVersion
    ? {...nzaaBeforeInternationalStandRepair, runway: nzaaBeforeInternationalStandRepair.runways[0]}
    : id === "KJFK" && selection.airportDataVersion === kjfkBeforeStandDedup.dataVersion
    ? {...kjfkBeforeStandDedup, runway: kjfkBeforeStandDedup.runways[0]}
    : id === "KBOS" && selection.airportDataVersion === kbosBeforeStandDedup.dataVersion
    ? {...kbosBeforeStandDedup, runway: kbosBeforeStandDedup.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeB03B04Import.dataVersion
    ? {...eddlBeforeB03B04Import, runway: eddlBeforeB03B04Import.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeA07Import.dataVersion
    ? {...eddlBeforeA07Import, runway: eddlBeforeA07Import.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeSevenTerminalLinks.dataVersion
    ? {...eddlBeforeSevenTerminalLinks, runway: eddlBeforeSevenTerminalLinks.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeA09A15Import.dataVersion
    ? {...eddlBeforeA09A15Import, runway: eddlBeforeA09A15Import.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeInferredStandImport.dataVersion
    ? {...eddlBeforeInferredStandImport, runway: eddlBeforeInferredStandImport.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeExtraStandImport.dataVersion
    ? {...eddlBeforeExtraStandImport, runway: eddlBeforeExtraStandImport.runways[0]}
    : id === "EBBR" && selection.airportDataVersion === ebbrBeforeNineStandImport.dataVersion
    ? {...ebbrBeforeNineStandImport, runway: ebbrBeforeNineStandImport.runways[0]}
    : id === "EBBR" && selection.airportDataVersion === ebbrBeforeExtraApronImport.dataVersion
    ? {...ebbrBeforeExtraApronImport, runway: ebbrBeforeExtraApronImport.runways[0]}
    : id === "EIDW" && selection.airportDataVersion === eidwBeforeGapStandImport.dataVersion
    ? {...eidwBeforeGapStandImport, runway: eidwBeforeGapStandImport.runways[0]}
    : id === "EIDW" && selection.airportDataVersion === eidwBeforeExtraStandImport.dataVersion
    ? {...eidwBeforeExtraStandImport, runway: eidwBeforeExtraStandImport.runways[0]}
    : id === "RJTT" && selection.airportDataVersion === rjttBefore109113Import.dataVersion
    ? {...rjttBefore109113Import, runway: rjttBefore109113Import.runways[0]}
    : id === "RJTT" && selection.airportDataVersion === rjttBeforeStand65Import.dataVersion
    ? {...rjttBeforeStand65Import, runway: rjttBeforeStand65Import.runways[0]}
    : id === "RJTT" && selection.airportDataVersion === rjttBeforeBranchStandImport.dataVersion
    ? {...rjttBeforeBranchStandImport, runway: rjttBeforeBranchStandImport.runways[0]}
    : id === "RJTT" && selection.airportDataVersion === rjttBeforeStand60Import.dataVersion
    ? {...rjttBeforeStand60Import, runway: rjttBeforeStand60Import.runways[0]}
    : id === "RJTT" && selection.airportDataVersion === rjttBeforeTerminal3Import.dataVersion
    ? {...rjttBeforeTerminal3Import, runway: rjttBeforeTerminal3Import.runways[0]}
    : id === "KSAN" && selection.airportDataVersion === ksanBeforeConnectorImport.dataVersion
    ? {...ksanBeforeConnectorImport, runway: ksanBeforeConnectorImport.runways[0]}
    : id === "EGPH" && selection.airportDataVersion === egphBefore209Removal.dataVersion
    ? {...egphBefore209Removal, runways: [{...egphBefore209Removal.runway, id: "06/24"}]}
    : id === "EGPH" && selection.airportDataVersion === egphBefore15bDedup.sourceDate
    ? {...egphBefore15bDedup, dataVersion: egphBefore15bDedup.sourceDate, runways: [{...egphBefore15bDedup.runway, id: "06/24"}]}
    : id === "SCEL" && selection.airportDataVersion === scelBeforeA02Dedup.dataVersion
    ? {...scelBeforeA02Dedup, runway: scelBeforeA02Dedup.runways[0]}
    : id === "LIME" && selection.airportDataVersion === limeBeforeStandImport.dataVersion
    ? {...limeBeforeStandImport, runway: limeBeforeStandImport.runways[0]}
    : id === "EDDS" && selection.airportDataVersion === eddsBeforeAdditionalStands.dataVersion
    ? {...eddsBeforeAdditionalStands, runway: eddsBeforeAdditionalStands.runways[0]}
    : id === "EDDS" && selection.airportDataVersion === eddsBeforeStandImport.dataVersion
    ? {...eddsBeforeStandImport, runway: eddsBeforeStandImport.runways[0]}
    : id === "RJTT" && selection.airportDataVersion === rjttBeforeStandImport.dataVersion
    ? {...rjttBeforeStandImport, runway: rjttBeforeStandImport.runways[0]}
    : id === "KSAN" && selection.airportDataVersion === ksanBeforeStandImport.dataVersion
    ? {...ksanBeforeStandImport, runway: ksanBeforeStandImport.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBeforeAdditionalFiveLinks.dataVersion
    ? {...cyycBeforeAdditionalFiveLinks, runway: cyycBeforeAdditionalFiveLinks.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBeforeInternationalLinks.dataVersion
    ? {...cyycBeforeInternationalLinks, runway: cyycBeforeInternationalLinks.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBeforeFiveTerminalLinks.dataVersion
    ? {...cyycBeforeFiveTerminalLinks, runway: cyycBeforeFiveTerminalLinks.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBeforeEightTerminalLinks.dataVersion
    ? {...cyycBeforeEightTerminalLinks, runway: cyycBeforeEightTerminalLinks.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBefore24Links.dataVersion
    ? {...cyycBefore24Links, runway: cyycBefore24Links.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBefore3738Links.dataVersion
    ? {...cyycBefore3738Links, runway: cyycBefore3738Links.runways[0]}
    : id === "CYYC" && selection.airportDataVersion === cyycBeforeStandImport.dataVersion
    ? {...cyycBeforeStandImport, runway: cyycBeforeStandImport.runways[0]}
    : id === "KSLC" && selection.airportDataVersion === kslcBeforeStandImport.dataVersion
    ? {...kslcBeforeStandImport, runway: kslcBeforeStandImport.runways[0]}
    : id === "EGSS" && selection.airportDataVersion === egssBeforeStandImport.dataVersion
    ? {...egssBeforeStandImport, runway: egssBeforeStandImport.runways[0]}
    : id === "EBBR" && selection.airportDataVersion === ebbrBeforeStandImport.dataVersion
    ? {...ebbrBeforeStandImport, runway: ebbrBeforeStandImport.runways[0]}
    : id === "LGAV" && selection.airportDataVersion === lgavBeforeTaxilaneImport.dataVersion
    ? {...lgavBeforeTaxilaneImport, runway: lgavBeforeTaxilaneImport.runways[0]}
    : id === "EDDL" && selection.airportDataVersion === eddlBeforeStandImport.dataVersion
    ? {...eddlBeforeStandImport, runway: eddlBeforeStandImport.runways[0]}
    : id === "PHOG" && selection.airportDataVersion === phogBeforeStandImport.dataVersion
    ? {...phogBeforeStandImport, runway: phogBeforeStandImport.runways[0]}
    : id === "LQSA" && selection.airportDataVersion === lqsaBeforeChartedAdditions.dataVersion
    ? {...lqsaBeforeChartedAdditions, runway: lqsaBeforeChartedAdditions.runways[0]}
    : id === "LQSA" && selection.airportDataVersion === lqsaBeforeStandImport.dataVersion
    ? {...lqsaBeforeStandImport, runway: lqsaBeforeStandImport.runways[0]}
    : id === "EIDW" && selection.airportDataVersion === eidwBeforeStandImport.dataVersion
    ? {...eidwBeforeStandImport, runway: eidwBeforeStandImport.runways[0]}
    : id === "LTFM" && selection.airportDataVersion === ltfmBeforeChart123StandImport.dataVersion
    ? {...ltfmBeforeChart123StandImport, runway: ltfmBeforeChart123StandImport.runways[0]}
    : id === "LTFM" && selection.airportDataVersion === ltfmBeforeChart4StandImport.dataVersion
    ? {...ltfmBeforeChart4StandImport, runway: ltfmBeforeChart4StandImport.runways[0]}
    : id === "EGLL" && selection.airportDataVersion === egllBeforeStand422Repair.dataVersion
    ? {...egllBeforeStand422Repair, runway: egllBeforeStand422Repair.runways[0]}
    : id === "EGLL" && selection.airportDataVersion === egllBeforeT4StandRepair.dataVersion
    ? {...egllBeforeT4StandRepair, runway: egllBeforeT4StandRepair.runways[0]}
    : id === "NZAA" && selection.airportDataVersion === nzaaBeforeDomesticStandRepair.dataVersion
    ? {...nzaaBeforeDomesticStandRepair, runway: nzaaBeforeDomesticStandRepair.runways[0]}
    : id === "LGAV" && selection.airportDataVersion === lgavBeforeStandRepair.dataVersion
    ? {...lgavBeforeStandRepair, runway: lgavBeforeStandRepair.runways[0]}
    : id === "SCEL" && selection.airportDataVersion === scelBeforeStandImport.dataVersion
    ? {...scelBeforeStandImport, runway: scelBeforeStandImport.runways[0]}
    : id === "TNCM" && selection.airportDataVersion === tncmBeforeStandImport.dataVersion
    ? {...tncmBeforeStandImport, runway: tncmBeforeStandImport.runways[0]}
    : id === "EIDW" ? legacyDublin : id === "KBHM" && selection.airportDataVersion === kbhmBeforeApron.dataVersion
    ? legacyKbhmApron : legacyRunways[id as AirportId];
  const airport = legacy && selection.airportDataVersion === legacy.dataVersion ? legacy : snapshots[id as AirportId];
  if (selection.airportDataVersion && selection.airportDataVersion !== airport.dataVersion)
    throw new Error("This airport data version is unavailable. Restore its pinned snapshot before opening this exercise.");
  return airport;
}
export const airportList = AIRPORT_IDS.map(id => snapshots[id]);
export type TrainingMode = "local" | "approach" | "center";
export type AirportTrainingCapabilities = {local: boolean; radar: boolean};
// Ground availability means a usable simulator ground layout, not merely that
// a real-world aerodrome chart exists. Add overrides here as airports are reviewed.
const trainingCapabilityOverrides: Partial<Record<AirportId, AirportTrainingCapabilities>> = {
  KASE: {local: false, radar: true},
};
export const airportTrainingCapabilities = (airport: Airport): AirportTrainingCapabilities =>
  trainingCapabilityOverrides[airport.icao as AirportId] ?? {
    local: airport.features.some(feature => feature.kind === "taxiway" || feature.kind === "taxilane"),
    radar: true,
  };
export const supportsTrainingMode = (capabilities: AirportTrainingCapabilities, mode: TrainingMode) =>
  mode === "local" ? capabilities.local : capabilities.radar;
export const airportSupportsTraining = (airport: Airport, mode: TrainingMode) => supportsTrainingMode(airportTrainingCapabilities(airport), mode);
export const airportTrainingError = (selection: AirportSelection): string | undefined => {
  const airport = getAirport(selection), mode = trainingMode(selection);
  if (airportSupportsTraining(airport, mode)) return;
  return mode === "local" ? `${airport.icao} is available for radar training only.` : `${airport.icao} is available for Ground & Tower training only.`;
};
export const airportRunways = (airport: Airport) => airport.runways ?? [{...airport.runway, id: airport.runway.ends.map(e => e.id).join("/")}];
export const runwayEnds = (airport: Airport) => airportRunways(airport).flatMap(r => r.ends);
export const defaultRunway = (airport: Airport) => airport.icao === "KASE" ? "15" : airport.icao === "VNLK" ? "06" : airport.runway.ends[1].id;
export const airportCallsign = (airport: Airport) => AIRPORT_RADIO_NAMES[airport.icao];

export type ServiceType = Frequency | "local" | "approach" | "center";
export interface RadioStation {id: string; service: ServiceType; name: string; airport?: string; sector?: string; mhz?: string; available: boolean}
const labels = {departure: "Departure", unicom: "Unicom",local: "Ground & Tower", ground: "Ground", tower: "Tower", atis: "ATIS", approach: "Approach", center: "Center"};
const primaryChannels = new Map<string, string>();
for (const row of aviationData.rows as {kind: string; airport?: string | null; type?: string; mhz?: number | string}[]) {
  if (row.kind !== "frequency" || !row.airport || !row.type || !row.mhz) continue;
  const key = `${row.airport}:${row.type}`;
  if (!primaryChannels.has(key)) primaryChannels.set(key, Number(row.mhz).toFixed(2));
}

/** IDs are independent of MHz and leave room for multiple regional sectors. */
export function airportStations(airport: Airport): RadioStation[] {
  return (["local", "ground", "tower", "atis", "approach", "center"] as const).map(service => ({
    id: `${airport.icao}:${service}`, service, airport: airport.icao, name: `${airportCallsign(airport)} ${labels[service]}`,
    available: true,
    mhz: primaryChannels.get(`${airport.icao}:${labels[service]}`) ?? (airport.icao === "EGPH" ? ({ground: "121.75", tower: "118.70", atis: "131.35"} as Partial<Record<ServiceType, string>>)[service] : undefined),
  }));
}
export function trainingStation(selection: AirportSelection): RadioStation {
  const airport = getAirport(selection), id = selection.trainingStation ?? `${airport.icao}:ground`;
  const station = airportStations(airport).find(s => s.id === id && s.available && ["local", "ground", "tower", "approach", "center"].includes(s.service));
  if (!station) throw new Error("Choose Ground & Tower, Approach or Center for this airport.");
  return station;
}
export function frequenciesFor(airport: Airport): Record<Frequency, {label: string; value: string; name: string}> {
  return {...{departure: {label: "Departure", value: "Training", name: `${airportCallsign(airport)} Departure`}, unicom: {label: "Unicom", value: "122.80", name: `${airportCallsign(airport)} Unicom`}}, ...Object.fromEntries(airportStations(airport).filter(s => s.available && s.service !== "local").map(s => [s.service, {label: labels[s.service], value: s.mhz ?? "Training", name: s.name}]))} as Record<Frequency, {label: string; value: string; name: string}>;
}
export const airportSelection = (airport: Airport, service: "local" | "ground" | "tower" | "approach" | "center" = "local") => ({airport: airport.icao as AirportId, airportDataVersion: airport.dataVersion!, trainingStation: `${airport.icao}:${service}`});
export const trainingMode = (selection: AirportSelection): "local" | "approach" | "center" => {const service = trainingStation(selection).service; return service === "approach" || service === "center" ? service : "local";};
export const openingFrequency = (selection: AirportSelection): Frequency => {const service = trainingStation(selection).service; return service === "local" ? "ground" : service as Frequency;};
export const controlledFrequencies = (selection: AirportSelection & {aircraft?: readonly Aircraft[]}): Frequency[] => {
  const mode = trainingMode(selection);
  return mode === "local" ? ["ground", "tower", "atis"] : [mode, ...(mode === "center" && selection.aircraft?.some(a => a.active && a.radar?.returningToApproach) ? ["approach" as const] : []), "atis"];
};
export const environmentLabel = (selection: AirportSelection) => `${selection.airport ?? "EGPH"} · ${labels[trainingMode(selection)]}`;
export const simulatedMetar = (airport: Airport, weather: import("./model").ExerciseWeather = EXERCISE_WEATHER) => weather.rawMetar ?? `Simulated ${airport.icao} · Wind ${weather.variableWind ? "VRB" : `${weather.windDirection}°`} at ${weather.windSpeed}${weather.windGust ? ` gusting ${weather.windGust}` : ""}KT · Visibility ${weather.visibilityKm}km · QNH ${weather.qnh}`;

/** Shared by API parsing and the engine, including nested event instructions. */
export function runwayReferenceError(value: unknown, airport: Airport): string | undefined {
  const allowed = new Set(runwayEnds(airport).map(end => end.id));
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return true;
    if (Array.isArray(value)) return value.every(visit);
    return Object.entries(value).every(([key, item]) => {
      if (key === "originDeparture") return true; // Validated as a self-contained runway snapshot.
      if(key==="runway" && typeof (value as {airportIcao?:string}).airportIcao === "string" && (value as {airportIcao?:string}).airportIcao!==airport.icao)return true;
      if (["runway", "lastRunway", "departureRunway"].includes(key) && typeof item === "string") return allowed.has(item);
      if (["departures", "arrivals"].includes(key) && Array.isArray(item)) return item.every(id => allowed.has(id));
      return visit(item);
    });
  };
  return visit(value) ? undefined : "A runway reference is not in this airport snapshot.";
}
