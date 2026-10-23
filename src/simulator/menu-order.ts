import type {MenuEntry} from "./catalog";
import type {Frequency} from "./model";
const common=["Roger","Wilco","Stand by","Report","Add Replay Bookmark","Voice Message","Broadcast Message","Send On Guard message","Unable","Deny Entry","Correction","Respond to Emergency","Resend Last Message"];
const ground=["Taxi to...","Progressive Taxi","Continue Taxi","Hold short...","Cross Runway...","Give way to...","Hold Position","Pushback Approved","Tow","Misc. Messages"];
const tower=["Cleared for Takeoff","Cancel Takeoff Clearance","Hold Short","Line up and Wait","Back Taxi","Cleared to Land / for the Option","Sequencing...","Pattern Instructions","Go Around","Respond to Go Around","Exit runway","Request 360","Approve Departure Request","Misc. Messages","Respond to Transition","Departure Sequencing...","Request Speed"];
const radar=["Respond to Flight Following Request","Vectoring Instructions","Request Speed","Expect Approach...","Contact Other Frequency","Clear for Approach","Ask for Intentions","Misc. Messages","Respond to Radar Vectors Request","Missed Approach Instructions","Request Hold","Radar Contact","Report Airport in Sight","Respond to STAR Descent Request","STAR","Respond to Diversion Request"];
/** IF ATCMessageManager registration order. Contextual replies occupy their
 * registered position and are highlighted; they are never duplicated at the top. */
export function orderedMenu(entries:MenuEntry[],frequency:Frequency){
 const order=frequency==="ground"?[...ground,"Contact Other Frequency","Ask for Intentions",...common]:frequency==="tower"?[...tower,"Contact Other Frequency","Ask for Intentions",...common]:[...radar,...common];
 const rank=(e:MenuEntry)=>{const i=order.indexOf(e.label.startsWith("Request Descent via ")?"STAR":e.label);return i<0?order.length-1:i;};
 return entries.map((entry,index)=>({entry,index})).sort((a,b)=>rank(a.entry)-rank(b.entry)||a.index-b.index).map(x=>x.entry);
}
