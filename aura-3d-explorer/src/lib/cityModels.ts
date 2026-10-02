import type { CityId } from "./cityPresets";

export interface CityModel {
  uid: string;
  coverage: string;
  width: number;
  rotation: number;
  textured: boolean;
  /** Source-space ground elevation, measured from broad horizontal ground faces.
   * Underground skirts are intentionally allowed below the site plane. */
  groundY: number;
}

/** One authored city/district per preset; never scatter or substitute buildings. */
export const CITY_MODELS: Partial<Record<CityId, CityModel>> = {
  "new-york": { groundY: -1.187324, uid: "372bc495b3a941308f4a3198bc45e17b", coverage: "Lower Manhattan", width: 520, rotation: 0, textured: true },
  miami: { groundY: 0.022081, uid: "570076f49f0c4b63a51948db40e92c31", coverage: "Miami · untextured city model", width: 1100, rotation: 0, textured: false },
  "los-angeles": { groundY: 0.048136, uid: "20c73feebd91436ea9c2efebee8a5661", coverage: "Los Angeles · City Hall district sample", width: 320, rotation: 0, textured: true },
  chicago: { groundY: 0.05665, uid: "5910afb517bd4d2cafd8f280dabf37a4", coverage: "Chicago · downtown district sample", width: 320, rotation: 0, textured: true },
  "san-francisco": { groundY: 0.085604, uid: "a7a5b99638f143af84bc646ae2d270c1", coverage: "San Francisco · downtown district sample", width: 360, rotation: 0, textured: true },
  seattle: { groundY: 0.296427, uid: "1128db3b12bd470eb6b2d1421a70e732", coverage: "Seattle · downtown district sample", width: 300, rotation: 0, textured: true },
  boston: { groundY: 0.063456, uid: "395d4a8639de411592797890e219dbd2", coverage: "Boston · downtown district sample", width: 320, rotation: 0, textured: true },
  toronto: { groundY: 0.047631, uid: "013c2e21e61c4a598c6d279f05953819", coverage: "Toronto · City Hall district sample", width: 340, rotation: 0, textured: true },
  london: { groundY: -1.913676, uid: "74cc9216f2c24efa96fe2554897e5966", coverage: "London · financial district reconstruction", width: 420, rotation: 0, textured: true },
  dubai: { groundY: -0.065989, uid: "0e60e12f253442ee8baffa3d9afb2c3d", coverage: "Dubai · untextured city model", width: 1100, rotation: 0, textured: false },
};
