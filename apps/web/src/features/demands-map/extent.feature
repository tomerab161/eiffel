Feature: Demand extents
  The map frames demands by their extent: the smallest box, aligned to longitude and latitude, that holds an area.

  Scenario: The extent of one demand is the box around its outline
    Given a demand whose outline runs through (10, 50), (13, 51), (12, 53), (9, 52) and back to (10, 50)
    When I ask for its extent
    Then the extent runs from longitude 9 to 13 and from latitude 50 to 53

  Scenario: A hole does not change a demand's extent
    Given a demand whose outline runs through (0, 0), (4, 0), (4, 4), (0, 4) and back to (0, 0)
    And the demand has a hole running through (1, 1), (2, 1), (2, 2), (1, 2) and back to (1, 1)
    When I ask for its extent
    Then the extent runs from longitude 0 to 4 and from latitude 0 to 4

  Scenario: The extent of all demands holds every demand
    Given a demand whose outline runs through (10, 50), (12, 50), (12, 52), (10, 52) and back to (10, 50)
    And a demand whose outline runs through (-5, 30), (-3, 30), (-3, 31), (-5, 31) and back to (-5, 30)
    When I ask for the extent of all demands
    Then the extent runs from longitude -5 to 12 and from latitude 30 to 52

  Scenario: Without demands there is no extent
    Given no demands
    When I ask for the extent of all demands
    Then there is no extent
