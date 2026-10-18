Feature: Map and table stay in sync
  Selecting a demand on the map or in the table highlights it in both places, and only one demand is highlighted at a time.
  Clicking a polygon scrolls the table to the demand's row and leaves the map view where it is.
  Clicking a row makes the map view frame the demand's polygon.
  "The map view frames an extent" means, measured in the map's projection: the visible extent of the map view holds the
  whole extent, and the extent spans at least 80% of the view's width or at least 80% of its height (padding allowed).
  "The table scrolls the row into view" means the row ends up inside the table's own scroll area, which sits beside the map.

  Scenario: Clicking a polygon highlights its row and scrolls the table to it
    Given /demands shows "North Field Survey", "Delta Irrigation" and "Harbor Expansion"
    When I click the polygon of "Harbor Expansion" on the map
    Then only the row "Harbor Expansion" is highlighted in the table
    And the table scrolls the row "Harbor Expansion" into view
    And only the polygon of "Harbor Expansion" is highlighted on the map
    And the map view does not move

  Scenario: Clicking a row highlights its polygon and frames the map on it
    Given /demands shows "North Field Survey", "Delta Irrigation" and "Harbor Expansion"
    When I click the row "Delta Irrigation" in the table
    Then only the row "Delta Irrigation" is highlighted in the table
    And only the polygon of "Delta Irrigation" is highlighted on the map
    And the map view frames the extent of "Delta Irrigation"

  Scenario: Pressing Enter on a focused row selects it like a click
    Given /demands shows "North Field Survey", "Delta Irrigation" and "Harbor Expansion"
    When I move keyboard focus to the row "Delta Irrigation" and press Enter
    Then only the row "Delta Irrigation" is highlighted in the table
    And only the polygon of "Delta Irrigation" is highlighted on the map
    And the map view frames the extent of "Delta Irrigation"

  Scenario Outline: A second selection replaces the first, wherever each was made
    Given /demands shows "North Field Survey", "Delta Irrigation" and "Harbor Expansion"
    When I click the <first> of "North Field Survey"
    And I click the <second> of "Harbor Expansion"
    Then only the row "Harbor Expansion" is highlighted in the table
    And only the polygon of "Harbor Expansion" is highlighted on the map

    Examples:
      | first   | second  |
      | row     | row     |
      | row     | polygon |
      | polygon | row     |
      | polygon | polygon |

  Scenario: Clicking the selected row again keeps it selected
    Given /demands shows "North Field Survey", "Delta Irrigation" and "Harbor Expansion"
    And I clicked the row "Delta Irrigation" and then panned the map away
    When I click the row "Delta Irrigation" in the table
    Then only the row "Delta Irrigation" is highlighted in the table
    And the map view frames the extent of "Delta Irrigation"

  Scenario: Clicking where two polygons overlap selects the one listed later
    Given /demands shows "Delta Irrigation" and then "Harbor Expansion", whose polygons overlap
    When I click the map where both polygons cover the point
    Then only the row "Harbor Expansion" is highlighted in the table
    And only the polygon of "Harbor Expansion" is highlighted on the map

  Scenario: Rows that share a name are told apart
    Given /demands shows two demands named "Depot", the first for "Acme Energy" and the second for "Nile Farms"
    When I click the row "Depot" for "Nile Farms"
    Then only the row "Depot" for "Nile Farms" is highlighted in the table
    And only the polygon of the "Depot" for "Nile Farms" is highlighted on the map
