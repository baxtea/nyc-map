'use strict';

Function.prototype.bindArgs = function (...boundArgs) {
    const targetFunction = this;
    return function (...args) { return targetFunction.call(this, ...boundArgs, ...args); };
};

/// Basic setup

let map = L.map(
    'map', {
        minZoom: 10,
        maxZoom: 18,
        maxBounds: [[40.49709237269567, -74.58274841308595], [40.99389273551914, -73.26438903808595]],
    }
).setView([40.72397393626433, -73.95137786865236], 12);
map.zoomControl.setPosition('topright');

let tiles = L.tileLayer('https://api.maptiler.com/maps/positron/{z}/{x}/{y}.png?key=DPuhSkOb2lMfsIEVGlAZ',{
    tileSize: 512,
    zoomOffset: -1,
    minZoom: 10,
    maxZoom: 18,
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>, Data by <a href="https://opendata.cityofnewyork.us">NYC OpenData</a>',
    crossOrigin: true
  }).addTo(map);

// ? several marker types
// ? decrease size of marker as we zoom out -- saw a stackoverflow post similar to this about geojson
// https://gis.stackexchange.com/questions/41928/adding-removing-geojson-layers-using-leaflet

// leaf icon
let marker = new L.Icon({
    iconUrl: 'http://leafletjs.com/examples/custom-icons/leaf-green.png',
    shadowUrl: 'http://leafletjs.com/examples/custom-icons/leaf-shadow.png',
    iconSize:     [38, 95],
    shadowSize:   [50, 64],
    iconAnchor:   [22, 94],
    shadowAnchor: [4, 62],
    popupAnchor:  [-3, -76]
});

let sidebar = L.control.sidebar('sidebar').addTo(map);

/// GeoJSON stuff

function onEachFeature(label, feature, layer) {
    if (feature.properties) {
        let props = feature.properties;
        // add a popup to the marker
        let popupContent = `<p><b>${feature.properties.name}</b>`
            + `<br />${label}</p>`
            + `<p>Address: ${props.address ? props.address : "Unknown"}`
            // + `<p>Contact: ${props.contact ? props.contact : "Unknown"}</p>`
            + `<br />Borough: ${props.Borough ? props.Borough : "Unknown"}</p>`;

            // TODO: use some kind of unique identifier instead of name -- this leads to conflicts for recycling bins with several
            // see https://gis.stackexchange.com/a/61202
            //+ `<p><a class="showmore" href="#details" onclick="infoControl.update('${feature.properties.name}')">Show More</a></p>`;
        layer.bindPopup(popupContent);
    }
}

let datasets = new Map();
let layers = new Map();
datasets.set("bins", "Public Recycling Bins");
datasets.set("textile", "Textile Drop-Off");
datasets.set("food", "Food Drop-Off");
datasets.set("leaf", "Leaf Drop-Off");
datasets.set("electronics", "Electronics Drop-Off");

for (const [ugly, pretty] of datasets.entries()) {
    $.getJSON(`data/${ugly}.geojson`, function(json) {
        let layer = L.geoJSON(json, {
            pointToLayer: function(feature, latlng) {
                // TODO: would be nice if we had bounding boxes in addition to lat/lng... probably possible to get with OSM API, but not a priority
                if (feature.geometry.type == "Point") {
                    return L.marker(latlng, {icon: marker});
                } else {
                    console.error(`ERROR: unsupported feature geometry ${feature.geometry.type} on item ${feature.properties}`);
                }
            },
            onEachFeature: onEachFeature.bindArgs(pretty)
        });
        layers.set(ugly, layer);
    });
}

// Popup explaining why none of the data is visible onload
L.Control.Guide = L.Control.extend({
    onAdd: function (map) {
        this._map = map;
        this._div = L.DomUtil.create('div', 'guide');
        this._div.innerHTML = "<p><b>To begin,</b><br /><br />click one of the icons in the sidebar (left)</p>";
        return this._div;
    },
    addTo: function (map) {
        this._div = this.onAdd(map);
        map.getContainer().appendChild(this._div);
        return this;
    },
    hide: function () {
        this._div.style.display = "none";
        return this;
    },
    show: function () {
        this._div.style.display = "block";
        return this;
    }
});

L.control.guide = function (options) {
    return new L.Control.Guide(options);
}

let guide = L.control.guide().addTo(map);

// Layer visibility controlled through the sidebar now
let activeLayer = null; // ugly name
let tmpLayer = null; // actual layer
function selectLayer(ugly) {
    if (tmpLayer) {
        map.removeLayer(tmpLayer);
    }
    if (activeLayer != ugly) {
        if (activeLayer) {
            map.removeLayer(layers.get(activeLayer));
        }
        map.addLayer(layers.get(ugly));
        activeLayer = ugly;
        guide.hide();
    }
}
for (const ugly of datasets.keys()) {
    $(`#${ugly}`).click(() => {
        selectLayer(ugly);
    });
}

// Proximity search using geolocation API
function userCoords() {
    function success(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
    }

    if (!navigator.geolocation) {
        $('.geo-error').text("Geolocation is not supported by your browser");
        // TODO: enter address by text
    } else {
        $('.geo-error').text("Locating…");
    }

}

$('.geo-bins, .geo-textile, .geo-food, .geo-leaves, .geo-electronics').each(() => {
    $(this).click(() => {
        // TODO: call userCoords, filter by radius, and zoom to that bounding box
        // NOTE: there is a leaflet function that zooms to the bounding box of all markers
        // Use this and then clamp the zoom
    });
});

// Keyword search
$('input[type="search"]').keyup(function(e) {
    if (e.keyCode == 13) { //enter key
        // ! this technique breaks the map
        map.removeLayer(layers.get(activeLayer));

        let keywords = $(this).val().split(" ");
        let pretty = datasets.get(activeLayer);

        $.getJSON(`data/${activeLayer}.geojson`, function(json) {
            let markerCount = 0;
            tmpLayer = L.geoJSON(json, {
                pointToLayer: function(feature, latlng) {
                    // TODO: would be nice if we had bounding boxes in addition to lat/lng... probably possible to get with OSM API, but not a priority
                    if (feature.geometry.type == "Point") {
                        return L.marker(latlng, {icon: marker});
                    } else {
                        console.error(`ERROR: unsupported feature geometry ${feature.geometry.type} on item ${feature.properties}`);
                    }
                },
                onEachFeature: onEachFeature.bindArgs(pretty),
                filter: function(feature, _layer) {
                    let matchesAll = true;
                    for (let word of keywords) {
                        if (!feature.properties.name.toLowerCase().includes(word.toLowerCase())) {
                            matchesAll = false;
                            break;
                        }
                    }
                    if (matchesAll) markerCount++;
                    return matchesAll;
                }
            }).addTo(map);

            if (markerCount == 1) {
                map.setZoom(map.getMaxZoom());
                map.setView(tmpLayer.getBounds().getCenter());
            } else if (markerCount > 1) {
                map.fitBounds(tmpLayer.getBounds());
            }
        });

        activeLayer = null;
    }
});
