// ============================================================================
// INVENTORY TRANSITION MODULE - SEED DATA (generated file)
// ----------------------------------------------------------------------------
// Pending stock moves exported from the Access DB on 2026-08-12, at the moment
// live inventory moved to Odoo. These are the only order lines that were still
// open (customer orders not yet shipped / supplier orders not yet received).
//
//   type "out" = pending OUTGOING shipment to a customer (will reduce stock)
//   type "in"  = pending INCOMING receipt from a supplier (will add stock)
//   qty        = quantity still remaining (original qty minus already posted)
//
// Source tables: tblOrder_hdr + tblOrder_detail (outgoing, 44 lines where
// remaining qty > 0 and IsProcessed_Shipment = false), tblSupplierOrder_hdr +
// tblSupplierOrder_detail (incoming, 25 lines where remaining qty > 0 and
// IsProcessed_Received = false), part numbers joined from tblPartMaster.
//
// Check-off state is NOT stored here - it lives in a small JSON file in
// OneDrive so it survives refreshes and deployments. See transition.js.
// ============================================================================

window.TRANSITION_SEED = {
  generatedAt: "2026-08-12",
  adjustments: [
    {
      "id": "out-19846",
      "type": "out",
      "partNumber": "1010-018",
      "description": "Spare Battery for PP7000, 400m",
      "qty": 1,
      "orderRef": "Job 94781",
      "custPO": "C43436",
      "orderDate": "2026-07-15",
      "expectedDate": null
    },
    {
      "id": "in-7773",
      "type": "in",
      "partNumber": "1010-018",
      "description": "Spare Battery for PP7000, 400m",
      "qty": 1,
      "orderRef": "PO SN260805C",
      "custPO": null,
      "orderDate": "2026-08-05",
      "expectedDate": "2026-08-31"
    },
    {
      "id": "out-19839",
      "type": "out",
      "partNumber": "1212-004-002PK",
      "description": "Pinch Tubes",
      "qty": 48,
      "orderRef": "Job 94775",
      "custPO": "9085",
      "orderDate": "2026-07-16",
      "expectedDate": null
    },
    {
      "id": "out-19840",
      "type": "out",
      "partNumber": "1212-004-002PK",
      "description": "Pinch Tubes",
      "qty": 16,
      "orderRef": "Job 94775",
      "custPO": "9085",
      "orderDate": "2026-07-16",
      "expectedDate": null
    },
    {
      "id": "out-19841",
      "type": "out",
      "partNumber": "1212-004-002PK",
      "description": "Pinch Tubes",
      "qty": 32,
      "orderRef": "Job 94775",
      "custPO": "9085",
      "orderDate": "2026-07-16",
      "expectedDate": null
    },
    {
      "id": "in-7753",
      "type": "in",
      "partNumber": "1212-004-002PK",
      "description": "Pinch Tubes",
      "qty": 125,
      "orderRef": "PO SN260723A",
      "custPO": null,
      "orderDate": "2026-07-23",
      "expectedDate": "2026-08-12"
    },
    {
      "id": "out-19100",
      "type": "out",
      "partNumber": "7700523",
      "description": "ELE SP AC .63\" x 10 NA",
      "qty": 60,
      "orderRef": "Job 94198",
      "custPO": "241",
      "orderDate": "2026-02-25",
      "expectedDate": null
    },
    {
      "id": "out-19539",
      "type": "out",
      "partNumber": "7701028",
      "description": "161-230",
      "qty": 250,
      "orderRef": "Job 94526",
      "custPO": "PO30637",
      "orderDate": "2026-05-18",
      "expectedDate": null
    },
    {
      "id": "out-19540",
      "type": "out",
      "partNumber": "7701028",
      "description": "161-230",
      "qty": 250,
      "orderRef": "Job 94526",
      "custPO": "PO30637",
      "orderDate": "2026-05-18",
      "expectedDate": null
    },
    {
      "id": "out-19541",
      "type": "out",
      "partNumber": "7701028",
      "description": "161-230",
      "qty": 250,
      "orderRef": "Job 94526",
      "custPO": "PO30637",
      "orderDate": "2026-05-18",
      "expectedDate": null
    },
    {
      "id": "out-19542",
      "type": "out",
      "partNumber": "7701028",
      "description": "161-230",
      "qty": 250,
      "orderRef": "Job 94526",
      "custPO": "PO30637",
      "orderDate": "2026-05-18",
      "expectedDate": null
    },
    {
      "id": "out-19543",
      "type": "out",
      "partNumber": "7701028",
      "description": "161-230",
      "qty": 250,
      "orderRef": "Job 94526",
      "custPO": "PO30637",
      "orderDate": "2026-05-18",
      "expectedDate": null
    },
    {
      "id": "out-19907",
      "type": "out",
      "partNumber": "7701028",
      "description": "161-230",
      "qty": 1500,
      "orderRef": "Job 94823",
      "custPO": "5423729",
      "orderDate": "2026-07-21",
      "expectedDate": null
    },
    {
      "id": "in-7707",
      "type": "in",
      "partNumber": "7701035",
      "description": "Mixer SP BL .50 x 30 AC PP LL 14.5L",
      "qty": 500,
      "orderRef": "PO SN260623A",
      "custPO": null,
      "orderDate": "2026-06-23",
      "expectedDate": "2026-07-24"
    },
    {
      "id": "out-19912",
      "type": "out",
      "partNumber": "AB 025-01-10-01",
      "description": "Cartridge Set, B System, 25mL, 1:1 PP  Nat Cart/Plunger",
      "qty": 1000,
      "orderRef": "Job 94827",
      "custPO": "SCOTT JOHN",
      "orderDate": "2026-07-23",
      "expectedDate": null
    },
    {
      "id": "in-7770",
      "type": "in",
      "partNumber": "AB 025-01-10-01",
      "description": "Cartridge Set, B System, 25mL, 1:1 PP  Nat Cart/Plunger",
      "qty": 1000,
      "orderRef": "PO SN260805A",
      "custPO": null,
      "orderDate": "2026-08-05",
      "expectedDate": "2026-09-07"
    },
    {
      "id": "out-19814",
      "type": "out",
      "partNumber": "AF 1125-02-14-04",
      "description": "(153160) Set 1125, 2:1, PP natural; Glass fiber reinforced, assembled with plug and bayonet ring",
      "qty": 532,
      "orderRef": "Job 94756",
      "custPO": "026-26",
      "orderDate": "2026-07-13",
      "expectedDate": null
    },
    {
      "id": "in-7740",
      "type": "in",
      "partNumber": "AF 1125-02-14-04",
      "description": "(153160) Set 1125, 2:1, PP natural; Glass fiber reinforced, assembled with plug and bayonet ring",
      "qty": 532,
      "orderRef": "PO SN260720A",
      "custPO": null,
      "orderDate": "2026-07-20",
      "expectedDate": "2026-09-09"
    },
    {
      "id": "out-19927",
      "type": "out",
      "partNumber": "AF 200-10-10-01",
      "description": "Cartridge,  200mL, 10:1, PP, short nose plug",
      "qty": 30,
      "orderRef": "Job 94838",
      "custPO": "1019648",
      "orderDate": "2026-08-05",
      "expectedDate": null
    },
    {
      "id": "out-19642",
      "type": "out",
      "partNumber": "AJ 600-01-10-06",
      "description": "Cartridge, 600ml., 1:1, PP natural, set, UM 13-PP",
      "qty": 1840,
      "orderRef": "Job 94617",
      "custPO": "WPD201365",
      "orderDate": "2026-06-10",
      "expectedDate": null
    },
    {
      "id": "in-7692",
      "type": "in",
      "partNumber": "AJ 600-01-10-06",
      "description": "Cartridge, 600ml., 1:1, PP natural, set, UM 13-PP",
      "qty": 1840,
      "orderRef": "PO SN260610A",
      "custPO": null,
      "orderDate": "2026-06-10",
      "expectedDate": "2026-08-10"
    },
    {
      "id": "out-19682",
      "type": "out",
      "partNumber": "AJ 600-01-10-06",
      "description": "Cartridge, 600ml., 1:1, PP natural, set, UM 13-PP",
      "qty": 11040,
      "orderRef": "Job 94651",
      "custPO": "220975",
      "orderDate": "2026-06-17",
      "expectedDate": null
    },
    {
      "id": "in-7701",
      "type": "in",
      "partNumber": "AJ 600-01-10-06",
      "description": "Cartridge, 600ml., 1:1, PP natural, set, UM 13-PP",
      "qty": 11040,
      "orderRef": "PO SN260617B",
      "custPO": null,
      "orderDate": "2026-06-17",
      "expectedDate": "2026-08-13"
    },
    {
      "id": "out-19908",
      "type": "out",
      "partNumber": "AJ 600-01-10-06",
      "description": "Cartridge, 600ml., 1:1, PP natural, set, UM 13-PP",
      "qty": 1840,
      "orderRef": "Job 94824",
      "custPO": "WPD201382",
      "orderDate": "2026-07-23",
      "expectedDate": null
    },
    {
      "id": "in-7771",
      "type": "in",
      "partNumber": "AJ 600-01-10-06",
      "description": "Cartridge, 600ml., 1:1, PP natural, set, UM 13-PP",
      "qty": 1840,
      "orderRef": "PO SN260805B",
      "custPO": null,
      "orderDate": "2026-08-05",
      "expectedDate": "2026-10-01"
    },
    {
      "id": "out-19922",
      "type": "out",
      "partNumber": "BM 0489",
      "description": "(BT 121-224) ELE SP AC .25\" x 24 NA",
      "qty": 250,
      "orderRef": "Job 94835",
      "custPO": "8619657",
      "orderDate": "2026-07-28",
      "expectedDate": null
    },
    {
      "id": "in-7769",
      "type": "in",
      "partNumber": "BM 0489",
      "description": "(BT 121-224) ELE SP AC .25\" x 24 NA",
      "qty": 250,
      "orderRef": "PO SN260804B",
      "custPO": null,
      "orderDate": "2026-08-04",
      "expectedDate": "2026-08-12"
    },
    {
      "id": "in-7450",
      "type": "in",
      "partNumber": "BM 06-24",
      "description": "(BT MC 06-24) Mixer, 6mm x 24 ELE., 1:1/2:1, White",
      "qty": 1500,
      "orderRef": "PO SN260128A",
      "custPO": null,
      "orderDate": "2026-01-28",
      "expectedDate": "2026-02-11"
    },
    {
      "id": "in-7656",
      "type": "in",
      "partNumber": "BM 6320S",
      "description": "(6.3-20-S) Mixer, 6mm x 20El",
      "qty": 72000,
      "orderRef": "PO SN260520B",
      "custPO": null,
      "orderDate": "2026-05-20",
      "expectedDate": "2026-07-17"
    },
    {
      "id": "out-19877",
      "type": "out",
      "partNumber": "BN14GX1.5_901-14-150-500",
      "description": "(901-14-150D) Blunt Needle, 14g x 1.5\", green (500 bulk bag)",
      "qty": 1,
      "orderRef": "Job 94804",
      "custPO": "40004054",
      "orderDate": "2026-07-13",
      "expectedDate": null
    },
    {
      "id": "out-19906",
      "type": "out",
      "partNumber": "BNSMDC18G",
      "description": "(SMDC-18G-QTY1000) 18g C 1.25\" Green Taper Tips (1000pk)",
      "qty": 2000,
      "orderRef": "Job 94822",
      "custPO": "40005229",
      "orderDate": "2026-07-22",
      "expectedDate": null
    },
    {
      "id": "out-19392",
      "type": "out",
      "partNumber": "MAH 05-21T",
      "description": "Mixer, 5.4mm x 21 ELE., 1:1/2:1, White",
      "qty": 200,
      "orderRef": "Job 94417",
      "custPO": "V2150870",
      "orderDate": "2026-04-20",
      "expectedDate": null
    },
    {
      "id": "out-19802",
      "type": "out",
      "partNumber": "MAH 06-17T",
      "description": "Mixer, 6.3mm x 17 ELE., 1:1/2:1, White",
      "qty": 3000,
      "orderRef": "Job 94744",
      "custPO": "8210",
      "orderDate": "2026-07-09",
      "expectedDate": null
    },
    {
      "id": "out-17739",
      "type": "out",
      "partNumber": "MBH 05-06T",
      "description": "Mixer, helix, 1:1/2:1, Dust Grey, White ELE, Stepped Tip",
      "qty": 8000,
      "orderRef": "Job 93151",
      "custPO": "KANNAN R",
      "orderDate": "2025-06-27",
      "expectedDate": null
    },
    {
      "id": "out-19919",
      "type": "out",
      "partNumber": "MBH 06-20T",
      "description": "Mixer, 6.3mm x 20 ELE, 1:1/2:1",
      "qty": 2000,
      "orderRef": "Job 94832",
      "custPO": "2026180",
      "orderDate": "2026-08-04",
      "expectedDate": null
    },
    {
      "id": "in-5480",
      "type": "in",
      "partNumber": "MCH 05-18T",
      "description": "Mixer, 5mm x 18 ELE., 1:1/2:1, White",
      "qty": 3000,
      "orderRef": "PO SN220508A1",
      "custPO": null,
      "orderDate": "2022-05-08",
      "expectedDate": "2023-03-03"
    },
    {
      "id": "in-7735",
      "type": "in",
      "partNumber": "MCH 13-18T",
      "description": "Mixer, 13mm x 18 ELE., 1:1/2:1, White",
      "qty": 3000,
      "orderRef": "PO SN260713A",
      "custPO": null,
      "orderDate": "2026-07-13",
      "expectedDate": "2026-08-18"
    },
    {
      "id": "out-19940",
      "type": "out",
      "partNumber": "MCH 13-18T",
      "description": "Mixer, 13mm x 18 ELE., 1:1/2:1, White",
      "qty": 500,
      "orderRef": "Job 94847",
      "custPO": "5232368-00",
      "orderDate": "2026-08-07",
      "expectedDate": null
    },
    {
      "id": "out-19942",
      "type": "out",
      "partNumber": "MCH 13-18T",
      "description": "Mixer, 13mm x 18 ELE., 1:1/2:1, White",
      "qty": 3000,
      "orderRef": "Job 94848",
      "custPO": "2949349",
      "orderDate": "2026-08-07",
      "expectedDate": null
    },
    {
      "id": "out-19943",
      "type": "out",
      "partNumber": "MCH 13-24T",
      "description": "Mixer, 13mm x 24 ELE., 1:1/2:1, White",
      "qty": 3200,
      "orderRef": "Job 94849",
      "custPO": "2942127",
      "orderDate": "2026-08-07",
      "expectedDate": null
    },
    {
      "id": "out-19902",
      "type": "out",
      "partNumber": "ME 05-24T",
      "description": "Mixer, 5mm x 24 ELE., Blue, 3/16 (.197)",
      "qty": 2000,
      "orderRef": "Job 94819",
      "custPO": "EFTAL",
      "orderDate": "2026-07-30",
      "expectedDate": null
    },
    {
      "id": "out-19042",
      "type": "out",
      "partNumber": "ME 08-24T",
      "description": "Mixer, 8mm x 24 ELE., Blue, 5/16 (.315)",
      "qty": 3000,
      "orderRef": "Job 94148",
      "custPO": "177926",
      "orderDate": "2026-02-13",
      "expectedDate": null
    },
    {
      "id": "out-19043",
      "type": "out",
      "partNumber": "ME 08-24T",
      "description": "Mixer, 8mm x 24 ELE., Blue, 5/16 (.315)",
      "qty": 3000,
      "orderRef": "Job 94148",
      "custPO": "177926",
      "orderDate": "2026-02-13",
      "expectedDate": null
    },
    {
      "id": "in-7493",
      "type": "in",
      "partNumber": "ME 08-24T",
      "description": "Mixer, 8mm x 24 ELE., Blue, 5/16 (.315)",
      "qty": 3000,
      "orderRef": "PO SN260219C",
      "custPO": null,
      "orderDate": "2026-02-19",
      "expectedDate": "2026-09-22"
    },
    {
      "id": "in-7494",
      "type": "in",
      "partNumber": "ME 08-24T",
      "description": "Mixer, 8mm x 24 ELE., Blue, 5/16 (.315)",
      "qty": 3000,
      "orderRef": "PO SN260219C",
      "custPO": null,
      "orderDate": "2026-02-19",
      "expectedDate": "2026-11-24"
    },
    {
      "id": "out-19228",
      "type": "out",
      "partNumber": "ME 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Blue, 5/16 (.315)",
      "qty": 1200,
      "orderRef": "Job 94292",
      "custPO": "178151",
      "orderDate": "2026-03-19",
      "expectedDate": null
    },
    {
      "id": "out-19229",
      "type": "out",
      "partNumber": "ME 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Blue, 5/16 (.315)",
      "qty": 1200,
      "orderRef": "Job 94292",
      "custPO": "178151",
      "orderDate": "2026-03-19",
      "expectedDate": null
    },
    {
      "id": "out-19230",
      "type": "out",
      "partNumber": "ME 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Blue, 5/16 (.315)",
      "qty": 1200,
      "orderRef": "Job 94292",
      "custPO": "178151",
      "orderDate": "2026-03-19",
      "expectedDate": null
    },
    {
      "id": "in-7558",
      "type": "in",
      "partNumber": "ME 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Blue, 5/16 (.315)",
      "qty": 1200,
      "orderRef": "PO SN260324A",
      "custPO": null,
      "orderDate": "2026-03-24",
      "expectedDate": "2026-09-01"
    },
    {
      "id": "in-7559",
      "type": "in",
      "partNumber": "ME 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Blue, 5/16 (.315)",
      "qty": 1200,
      "orderRef": "PO SN260324A",
      "custPO": null,
      "orderDate": "2026-03-24",
      "expectedDate": "2026-10-01"
    },
    {
      "id": "in-7560",
      "type": "in",
      "partNumber": "ME 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Blue, 5/16 (.315)",
      "qty": 1200,
      "orderRef": "PO SN260324A",
      "custPO": null,
      "orderDate": "2026-03-24",
      "expectedDate": "2026-11-02"
    },
    {
      "id": "out-19941",
      "type": "out",
      "partNumber": "ME 13-24T-A110",
      "description": "Mixer, 13mm x 24 ELE., Blue, 1/2 (.512) with a modified tip",
      "qty": 2100,
      "orderRef": "Job 94847",
      "custPO": "5232368-00",
      "orderDate": "2026-08-07",
      "expectedDate": null
    },
    {
      "id": "out-19921",
      "type": "out",
      "partNumber": "MFQ 05-24L",
      "description": "Mixer, 5.0/24, F-system 1:1, 2:1",
      "qty": 39,
      "orderRef": "Job 94834",
      "custPO": "9089",
      "orderDate": "2026-08-04",
      "expectedDate": null
    },
    {
      "id": "out-19817",
      "type": "out",
      "partNumber": "MFQ 08-24C-07",
      "description": "(128113) Mixing Spray Tip MF, Grey",
      "qty": 500,
      "orderRef": "Job 94756",
      "custPO": "026-26",
      "orderDate": "2026-07-13",
      "expectedDate": null
    },
    {
      "id": "out-19806",
      "type": "out",
      "partNumber": "MFQ 08-24D 2CV",
      "description": "Mixer, F System, 8.7x24, Straight Oulet, with BRF Ring, 2 Check Valves",
      "qty": 1000,
      "orderRef": "Job 94748",
      "custPO": "4500290633",
      "orderDate": "2026-07-13",
      "expectedDate": null
    },
    {
      "id": "in-7744",
      "type": "in",
      "partNumber": "MFQ 08-24D 2CV",
      "description": "Mixer, F System, 8.7x24, Straight Oulet, with BRF Ring, 2 Check Valves",
      "qty": 1000,
      "orderRef": "PO SN260720B",
      "custPO": null,
      "orderDate": "2026-07-20",
      "expectedDate": "2026-11-15"
    },
    {
      "id": "in-6910",
      "type": "in",
      "partNumber": "MKH 03-16S",
      "description": "Mixer 3.2-16-S-IN MIXER DARK GREY",
      "qty": 4000,
      "orderRef": "PO SN250423A",
      "custPO": null,
      "orderDate": "2025-04-23",
      "expectedDate": "2025-06-10"
    },
    {
      "id": "out-10987",
      "type": "out",
      "partNumber": "MS 05-32T",
      "description": "Mixer, 5mm x 32 ELE., Yellow, 3/16 (.197)",
      "qty": 55,
      "orderRef": "Job 88098",
      "custPO": "GM-PO-22-1",
      "orderDate": "2022-05-23",
      "expectedDate": null
    },
    {
      "id": "in-7585",
      "type": "in",
      "partNumber": "MS 06-32T",
      "description": "Mixer, 6mm x 32 ELE., Yellow, 1/4 (.250)",
      "qty": 3000,
      "orderRef": "PO SN260406B",
      "custPO": null,
      "orderDate": "2026-04-06",
      "expectedDate": "2026-04-10"
    },
    {
      "id": "out-11022",
      "type": "out",
      "partNumber": "MS 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Yellow, 5/16 (.315)",
      "qty": 77,
      "orderRef": "Job 88120",
      "custPO": "PO027367",
      "orderDate": "2022-05-27",
      "expectedDate": null
    },
    {
      "id": "out-19861",
      "type": "out",
      "partNumber": "MS 08-32T",
      "description": "Mixer, 8mm x 32 ELE., Yellow, 5/16 (.315)",
      "qty": 600,
      "orderRef": "Job 94793",
      "custPO": "28194",
      "orderDate": "2026-07-29",
      "expectedDate": null
    },
    {
      "id": "in-7752",
      "type": "in",
      "partNumber": "MS 10-18T/50-BW",
      "description": "(186344) Mixer, 10mm x 18 ELE., Yellow, 3/8 (.394) - 50pk Bag",
      "qty": 28000,
      "orderRef": "PO SN260722B",
      "custPO": null,
      "orderDate": "2026-07-22",
      "expectedDate": "2026-08-11"
    },
    {
      "id": "out-19901",
      "type": "out",
      "partNumber": "MSR 13-12T",
      "description": "Mixer, Rotating, 13mm x 12 ELE., Green",
      "qty": 7000,
      "orderRef": "Job 94819",
      "custPO": "EFTAL",
      "orderDate": "2026-07-30",
      "expectedDate": null
    },
    {
      "id": "out-19845",
      "type": "out",
      "partNumber": "PP7000-400M-101-B22V1",
      "description": "Power Push 20v Battery Dispenser: 400mL, 10:1 ratio",
      "qty": 1,
      "orderRef": "Job 94781",
      "custPO": "C43436",
      "orderDate": "2026-07-15",
      "expectedDate": null
    },
    {
      "id": "in-7772",
      "type": "in",
      "partNumber": "PP7000-400M-101-B22V1",
      "description": "Power Push 20v Battery Dispenser: 400mL, 10:1 ratio",
      "qty": 1,
      "orderRef": "PO SN260805C",
      "custPO": null,
      "orderDate": "2026-08-05",
      "expectedDate": "2026-08-31"
    },
    {
      "id": "out-19815",
      "type": "out",
      "partNumber": "PVAQ 1125-02-51",
      "description": "(183842) Piston A, 1125mL, 2:1, self-venting function",
      "qty": 532,
      "orderRef": "Job 94756",
      "custPO": "026-26",
      "orderDate": "2026-07-13",
      "expectedDate": null
    },
    {
      "id": "in-7741",
      "type": "in",
      "partNumber": "PVAQ 1125-02-51",
      "description": "(183842) Piston A, 1125mL, 2:1, self-venting function",
      "qty": 532,
      "orderRef": "PO SN260720A",
      "custPO": null,
      "orderDate": "2026-07-20",
      "expectedDate": "2026-09-09"
    },
    {
      "id": "out-19816",
      "type": "out",
      "partNumber": "PVBQ 1125-02-51",
      "description": "(128069) Piston B, 1125mL, 2:1",
      "qty": 532,
      "orderRef": "Job 94756",
      "custPO": "026-26",
      "orderDate": "2026-07-13",
      "expectedDate": null
    },
    {
      "id": "in-7742",
      "type": "in",
      "partNumber": "PVBQ 1125-02-51",
      "description": "(128069) Piston B, 1125mL, 2:1",
      "qty": 532,
      "orderRef": "PO SN260720A",
      "custPO": null,
      "orderDate": "2026-07-20",
      "expectedDate": "2026-09-09"
    }
  ]
};
