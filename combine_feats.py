import json
from collections import defaultdict

# Load the original GeoJSON
with open("epa-flight-map/public/flight_data.geojson", "r", encoding="utf-8") as f:
    data = json.load(f)

grouped = defaultdict(list)

# Group by parent company (you can switch to 'FACILITY NAME' or another field)
for feature in data["features"]:
    key = feature["properties"]["FACILITY NAME"].lower().strip()
    grouped[key].append(feature)

# Create new grouped features
grouped_features = []
for key, features in grouped.items():
    total_emissions = 0
    lat_sum, lon_sum = 0, 0
    count = 0
    base = features[0]

    for feat in features:
        try:
            total_emissions += float(
                feat["properties"]["GHG QUANTITY (METRIC TONS CO2e)"].replace(",", "")
            )
        except:
            pass
        lon, lat = feat["geometry"]["coordinates"]
        lat_sum += lat
        lon_sum += lon
        count += 1

    new_feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon_sum / count, lat_sum / count],
        },
        "properties": {
            "facility": key.title(),
            "emissions": round(total_emissions),
            "count": count,
            "state": base["properties"]["STATE"],
            "city": base["properties"]["CITY NAME"],
            "year": base["properties"]["REPORTING YEAR"],
            "address": base["properties"]["REPORTED ADDRESS"],
            "parent": base["properties"]["PARENT COMPANIES"],
        },
    }
    grouped_features.append(new_feature)

# Save to new GeoJSON
out = {"type": "FeatureCollection", "features": grouped_features}

with open("epa-flight-map/public/flight_data_grouped.geojson", "w") as f:
    json.dump(out, f, indent=2)
