import { foodCheck } from '../shared/features.js';
import type { Vendor } from '../shared/model.js';
import type { ViewState } from './state.js';

/** Current saved locations, never invented walking routes or timetable proximity. */
export function pickupAreas(vendors: Vendor[]) {
    const groups=new Map<string,Vendor[]>();
    for(const v of vendors.filter(v=>v.open&&!v.archived))groups.set(v.location,[...(groups.get(v.location)??[]),v]);
    return [...groups].map(([location,kitchens])=>{
        const parts=location.match(/^(.*?)\s*\(([^)]+)\)$/);
        const name=parts?.[1]||location, level=parts?.[2]??'';
        const lead=kitchens.find(v=>v.id==='subway')??kitchens[0]!;
        const photos:Record<string,string>={'asian-cuisine':'asian-cuisine',bobanika:'bobanika','chinese-kitchen':'chinese','japanese-kitchen':'japanese','korean-kitchen':'korean','lets-kopitiam':'lets-kopitiam',nelson:'nelson',subway:'subway','western-kitchen':'western'};
        const asset=Object.hasOwn(photos,lead.id)?photos[lead.id]:undefined;
        return {location,name,level,kitchens,photo:asset?`/images/cafeterias/${asset}.jpg`:null,photoKitchen:lead.name};
    }).sort((a,b)=>(Number(a.level.match(/\d+/)?.[0])||999)-(Number(b.level.match(/\d+/)?.[0])||999));
}
export function menuResults(s: ViewState, includePrep = true) {
    const active=new Map(s.vendors.filter(v=>v.open&&!v.archived).map(v=>[v.id,v]));
    return s.items.filter(i=>{
        const v=active.get(i.vendorId);if(!v)return false;
        if(s.areaFilter&&v.location!==s.areaFilter)return false;
        if(s.vendorFilter!=='all'&&i.vendorId!==s.vendorFilter)return false;
        if(s.category!=='All'&&i.category!==s.category)return false;
        if(!`${i.name} ${i.description} ${v.name}`.toLowerCase().includes(s.search.trim().toLowerCase()))return false;
        if(s.allergenFilters.length&&!foodCheck(i.foodInfo,{diets:[],avoid:s.allergenFilters,hideUnsuitable:true}).suitable)return false;
        if(s.profile.preferences.hideUnsuitable&&!foodCheck(i.foodInfo,s.profile.preferences).suitable)return false;
        if(s.menuDiet!=='all'&&!foodCheck(i.foodInfo,{diets:[s.menuDiet],avoid:[],hideUnsuitable:true}).suitable)return false;
        if(s.spicyOnly&&!['spicy','extra_spicy'].includes(i.foodInfo?.spice??''))return false;
        return !includePrep||s.maxPrepMinutes===null||i.prepMinutes<=s.maxPrepMinutes;
    });
}
