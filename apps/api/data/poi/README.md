# data/poi

`jp.csv` is the seed POI catalogue (D0.2 / D0.3). Target for Phase 0 is **≥ 300
points** across Tokyo, Yokohama, Kamakura/Enoshima, Fuji/Kawaguchiko and Kawagoe.

Workflow: maintain it as a spreadsheet, export CSV here, then

```
docker compose exec api go run . seed
```

Columns (draft — fix before the first import, then update the CSV reader in
`seeder.go`):

```
name_th,name_en,name_ja,city,area,category,tags,lat,lng,google_place_id,
open_hours,closed_days,avg_visit_min,avg_cost_jpy,cost_note,tips,source
```
