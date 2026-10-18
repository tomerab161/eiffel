Feature: Selecting a demand
  At most one demand is selected at a time. A demand is known by its position in the list, so demands that share a name are still told apart.

  Scenario: Nothing is selected at first
    Given 3 demands
    When nothing has been selected yet
    Then no demand is selected

  Scenario: Selecting a demand makes it the selected one
    Given 3 demands
    When I select demand 2
    Then demand 2 is selected
    And demands 1 and 3 are not selected

  Scenario: Selecting another demand replaces the selection
    Given 3 demands
    And demand 1 is selected
    When I select demand 3
    Then demand 3 is selected
    And demands 1 and 2 are not selected

  Scenario: Selecting the selected demand again keeps it selected
    Given 3 demands
    And demand 2 is selected
    When I select demand 2
    Then demand 2 is selected

  Scenario Outline: Picking a point selects the latest-listed demand under it
    Given 3 demands
    And demand 1 is selected
    When I pick a point covered by <covering>
    Then <result>

    Examples:
      | covering            | result                 |
      | demand 2 only       | demand 2 is selected   |
      | demands 2 and 3     | demand 3 is selected   |
      | demands 1, 2 and 3  | demand 3 is selected   |
      | demand 1 only       | demand 1 is selected   |

  Scenario: Demands that share a name are told apart
    Given 3 demands, where demands 2 and 3 are both named "Depot"
    When I select demand 3
    Then demand 3 is selected
    And demand 2 is not selected
