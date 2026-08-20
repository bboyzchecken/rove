package ai

// Tools the planner model may call. This list is the guardrail described in
// DEV_SPEC §6.3: the model is not allowed to state an opening time, a travel
// duration, a temperature or an exchange rate that did not come from here.
//
//	lookup_poi(query, city?)      -> POI candidates from our DB (FULLTEXT)
//	get_poi(poi_id)               -> full POI incl. open_hours, closed_days
//	distance(from, to, mode)      -> minutes + metres, Redis-cached
//	weather(lat, lng, date)       -> daily forecast
//	fx(from, to)                  -> exchange rate
//
// TODO(A4.2): implement each as a tool definition plus a dispatcher that calls
// the matching pkg/services/* interface.
