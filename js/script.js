/**
 * Chicago Narcotics Crime Visualization
 * Timeline + Choropleth map with brushing and linking
 */

// Load both datasets and initialize visualizations
Promise.all([
  d3.csv("data/chicago_crimes_reduced.csv"),
  d3.json("data/chicago_districts.geojson")
]).then(([crimeData, geoData]) => {
  const parseDate = d3.timeParse("%m/%d/%Y %I:%M:%S %p");

  // Filter crimes: only narcotics with valid district
  const narcotics = crimeData.filter(d => {
    return d["Primary Type"] === "NARCOTICS" && d.District && d.District.trim() !== "";
  }).map(d => {
    const date = parseDate(d.Date);
    return { ...d, date, district: d.District };
  }).filter(d => d.date != null);

  // Aggregate by month (for timeline)
  const byMonth = d3.rollups(
    narcotics,
    v => v.length,
    d => d3.timeMonth(d.date)
  ).map(([date, count]) => ({ date, count })).sort((a, b) => a.date - b.date);

  // Aggregate by district (full dataset)
  const byDistrict = d3.rollups(
    narcotics,
    v => v.length,
    d => d.district
  ).map(([district, count]) => ({ district, count }));

  // Aggregate by district and month (for brush filtering)
  const byDistrictMonth = new Map();
  narcotics.forEach(d => {
    const month = d3.timeMonth(d.date);
    if (!byDistrictMonth.has(d.district)) {
      byDistrictMonth.set(d.district, new Map());
    }
    const distMap = byDistrictMonth.get(d.district);
    distMap.set(month, (distMap.get(month) || 0) + 1);
  });

  // Create map (choropleth) and timeline
  const updateMap = createMap(geoData, byDistrict, byDistrictMonth);
  createLineChart(byMonth, updateMap);
});


 // Normalize district ID for joining GeoJSON with crime data.

function districtKey(num) {
  return String(num).padStart(3, "0");
}

// Create choropleth map of Chicago police districts.
 
function createMap(geoData, byDistrict, byDistrictMonth) {
  const width = 700;
  const height = 500;

  const svg = d3.select("#districtMap")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Projection: Mercator, fit to Chicago bounds
  const projection = d3.geoMercator()
    .fitSize([width, height], geoData);

  const path = d3.geoPath().projection(projection);

  // Color scale: sequential reds
  const colorScale = d3.scaleSequential(d3.interpolateReds)
    .domain([0, d3.max(byDistrict, d => d.count)]);

  // Tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("pointer-events", "none");

  const districtsG = svg.append("g").attr("class", "districts");

  // Legend (updated with scale in updateMap)
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 150}, 20)`);

  // Update map with filtered crime counts.
  function updateMap(timeRange) {
    let crimeByDistrict;
    if (timeRange) {
      const [start, end] = timeRange;
      const districtCounts = new Map();
      byDistrictMonth.forEach((monthMap, district) => {
        let count = 0;
        monthMap.forEach((c, month) => {
          if (month >= start && month <= end) count += c;
        });
        districtCounts.set(district, count);
      });
      crimeByDistrict = districtCounts;
    } else {
      crimeByDistrict = new Map(byDistrict.map(d => [d.district, d.count]));
    }

    const values = [...crimeByDistrict.values()];
    const maxCount = Math.max(d3.max(values) || 0, 1);
    colorScale.domain([0, maxCount]);

    // Update legend
    legend.selectAll("*").remove();
    const breaks = d3.ticks(0, maxCount, 5);
    const n = breaks.length - 1;
    legend.append("text")
      .attr("x", 0)
      .attr("y", -5)
      .attr("font-size", 11)
      .attr("font-weight", "bold")
      .attr("fill", "#333")
      .text("Narcotics crimes");
    const swatches = legend.selectAll(".swatch")
      .data(d3.range(n))
      .join("g")
      .attr("class", "swatch")
      .attr("transform", (_, i) => `translate(0, ${10 + i * 22})`);
    swatches.append("rect")
      .attr("width", 18)
      .attr("height", 14)
      .attr("fill", (_, i) => colorScale(breaks[i]))
      .attr("stroke", "#999")
      .attr("stroke-width", 0.5);
    swatches.append("text")
      .attr("x", 24)
      .attr("y", 11)
      .attr("font-size", 10)
      .attr("fill", "#333")
      .text((_, i) => {
        const lo = breaks[i];
        const hi = breaks[i + 1];
        return i === n - 1
          ? `${lo.toLocaleString()}+`
          : `${lo.toLocaleString()} – ${hi.toLocaleString()}`;
      });

    const features = geoData.features;
    const paths = districtsG.selectAll("path")
      .data(features);

    paths.exit().remove();

    const enter = paths.enter()
      .append("path")
      .attr("class", "district")
      .attr("d", path)
      .attr("fill", d => {
        const key = districtKey(d.properties.dist_num);
        return colorScale(crimeByDistrict.get(key) || 0);
      })
      .attr("stroke", "#333")
      .attr("stroke-width", 0.5);

    enter.merge(paths)
      .transition()
      .duration(300)
      .attr("fill", d => {
        const key = districtKey(d.properties.dist_num);
        return colorScale(crimeByDistrict.get(key) || 0);
      })
      .on("end", function() {
        // Re-attach hover handlers after transition
        d3.select(this).style("cursor", "pointer");
      });

    enter.merge(paths)
      .on("mouseover", function(event, d) {
        const key = districtKey(d.properties.dist_num);
        const count = crimeByDistrict.get(key) || 0;
        d3.selectAll(".district").classed("dimmed", true);
        d3.select(this).classed("dimmed", false).classed("highlighted", true);
        tooltip
          .style("opacity", 1)
          .html(`District ${key}: ${count.toLocaleString()} narcotics crimes`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY + 10) + "px");
      })
      .on("mouseout", function() {
        d3.selectAll(".district").classed("dimmed", false).classed("highlighted", false);
        tooltip.style("opacity", 0);
      });
  }

  updateMap(null);
  return updateMap;
}

/**
 * Create timeline line chart with brushing.
 */
function createLineChart(byMonth, updateMap) {
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const width = 800 - margin.left - margin.right;
  const height = 200 - margin.top - margin.bottom;

  const svg = d3.select("#timeline")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleTime()
    .domain(d3.extent(byMonth, d => d.date))
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(byMonth, d => d.count)])
    .range([height, 0])
    .nice();

  const line = d3.line()
    .x(d => xScale(d.date))
    .y(d => yScale(d.count));

  g.append("path")
    .datum(byMonth)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr("d", line);

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale).ticks(width / 80));

  g.append("g")
    .call(d3.axisLeft(yScale));

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", `translate(-45,${height / 2}) rotate(-90)`)
    .attr("fill", "#333")
    .text("Number of Crimes");

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", `translate(${width / 2},${height + 40})`)
    .attr("fill", "#333")
    .text("Time (Month/Year)");

  const brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on("brush end", function() {
      const selection = d3.brushSelection(this);
      if (selection) {
        const timeRange = [xScale.invert(selection[0]), xScale.invert(selection[1])];
        updateMap(timeRange);
      } else {
        updateMap(null);
      }
    });

  g.append("g")
    .attr("class", "brush")
    .call(brush);
}

