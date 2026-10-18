Feature: Demands page
  The page at /demands reads the demands file that the web app serves at /demands.geojson.
  It shows every demand as a polygon on the map, next to a table of Name, Country and Customer.
  "The map view frames an extent" means, measured in the map's projection: the visible extent of the map view holds the
  whole extent, and the extent spans at least 80% of the view's width or at least 80% of its height (padding allowed).
  "The world view" means the map view is centred on longitude 0, latitude 0 at zoom level 0.

  Scenario: Every demand is listed in file order and drawn on the map
    Given /demands.geojson holds the valid demands:
      | name               | country     | customer       |
      | North Field Survey | Norway      | Acme Energy    |
      | Delta Irrigation   | Egypt       | Nile Farms     |
      | Harbor Expansion   | Netherlands | Port Logistics |
    When I open /demands
    Then the table has the columns "Name", "Country" and "Customer"
    And the table rows are, in order, "North Field Survey", "Delta Irrigation" and "Harbor Expansion" with their country and customer
    And the map shows 3 demand polygons

  Scenario: Nothing is highlighted at first and the map frames all demands
    Given /demands.geojson holds 3 valid demands
    When I open /demands
    Then no table row is highlighted
    And no polygon is highlighted on the map
    And the map view frames the extent of all 3 demands

  Scenario: The page says it is loading until the file arrives
    Given /demands.geojson has not answered yet
    When I open /demands
    Then I see "Loading demands…"

  Scenario: An empty file shows an empty table and the world view
    Given /demands.geojson holds a collection with no demands
    When I open /demands
    Then I see "No demands to show"
    And the map shows no demand polygons
    And the map shows the world view

  Scenario Outline: A file that cannot be used shows an error and no demands
    Given /demands.geojson <problem>
    When I open /demands
    Then I see "Demands could not be loaded."
    And the table has no rows
    And the map shows no demand polygons

    Examples:
      | problem                                                |
      | answers with status 404                                |
      | answers with status 500                                |
      | cannot be reached and the request fails with no answer |
      | answers with a body that is not JSON                   |
      | holds 2 valid demands and one with an empty name       |

  Scenario: The table scrolls on its own beside the map
    Given the demands file that ships with the web app
    When I open /demands in a window 1280 pixels wide and 720 pixels tall
    Then the map and the table sit side by side
    And the table is its own scroll area that shows fewer than all 20 rows at once
    And the page itself does not scroll

  Scenario: The shipped demands file holds the sample demands
    Given the demands file that ships with the web app
    When I open /demands
    Then the table lists 20 demands
    And the first row is "North Field Survey", "Norway", "Acme Energy"
    And the last row is "Harbor Expansion", "Netherlands", "Port Logistics"

  Scenario: The shipped sample polygons are separate rectangles
    Given the demands file that ships with the web app
    When the file is read
    Then every demand's outline is a rectangle of 4 corners, closed back to its first corner
    And no two demands overlap
