Feature: Demands collection
  A demand is an area a customer asks for: a polygon with a name, a country and a customer.
  All demands are read from one collection. If any demand in it is invalid, the whole collection is rejected.

  Scenario: A collection of valid demands is read in order
    Given a collection with the demands:
      | name               | country | customer    |
      | North Field Survey | Norway  | Acme Energy |
      | Delta Irrigation   | Egypt   | Nile Farms  |
    When the collection is read
    Then it holds 2 demands
    And the demands are, in order, "North Field Survey" then "Delta Irrigation"
    And each demand keeps its name, country, customer and polygon

  Scenario: An empty collection holds no demands
    Given a collection with no demands
    When the collection is read
    Then it holds 0 demands

  Scenario Outline: A demand's name, country and customer must have a visible value
    Given a collection with one demand whose <property> is <value>
    When the collection is read
    Then the collection is <outcome>

    # Values keep their quotes so the spaces survive: empty, three spaces, one character.
    Examples:
      | property | value | outcome  |
      | name     | ""    | rejected |
      | name     | "   " | rejected |
      | name     | "A"   | accepted |
      | country  | ""    | rejected |
      | country  | "   " | rejected |
      | country  | "A"   | accepted |
      | customer | ""    | rejected |
      | customer | "   " | rejected |
      | customer | "A"   | accepted |

  Scenario Outline: A demand without a name, country or customer is rejected
    Given a collection with one demand that has no <property>
    When the collection is read
    Then the collection is rejected

    Examples:
      | property |
      | name     |
      | country  |
      | customer |

  Scenario: A demand whose name is not text is rejected
    Given a collection with one demand whose name is the number 42
    When the collection is read
    Then the collection is rejected

  Scenario: Extra details on a demand are ignored
    Given a collection with one valid demand that also has a "priority" of "high"
    When the collection is read
    Then it holds 1 demand
    And that demand has only a name, a country, a customer and a polygon

  Scenario Outline: Only a polygon describes a demand's area
    Given a collection with one demand whose area is <shape>
    When the collection is read
    Then the collection is <outcome>

    Examples:
      | shape            | outcome  |
      | a polygon        | accepted |
      | a point          | rejected |
      | a line           | rejected |
      | a multi-polygon  | rejected |
      | missing          | rejected |

  Scenario Outline: A polygon's outline needs at least four positions
    Given a collection with one demand whose closed outline has <count> positions
    When the collection is read
    Then the collection is <outcome>

    Examples:
      | count | outcome  |
      | 3     | rejected |
      | 4     | accepted |
      | 5     | accepted |

  Scenario: An outline that does not end where it starts is rejected
    Given a collection with one demand whose outline has 4 positions and ends away from its start
    When the collection is read
    Then the collection is rejected

  Scenario: A polygon with no outline is rejected
    Given a collection with one demand whose polygon has no outline
    When the collection is read
    Then the collection is rejected

  Scenario: A polygon with a hole is accepted
    Given a collection with one demand whose polygon has an outline and one closed hole inside it
    When the collection is read
    Then it holds 1 demand

  Scenario Outline: A hole needs at least four positions, like the outline
    Given a collection with one demand whose polygon has a valid outline and a closed hole of <count> positions
    When the collection is read
    Then the collection is <outcome>

    Examples:
      | count | outcome  |
      | 3     | rejected |
      | 4     | accepted |
      | 5     | accepted |

  Scenario: A hole that does not end where it starts is rejected
    Given a collection with one demand whose polygon has a valid outline and a hole of 4 positions that ends away from its start
    When the collection is read
    Then the collection is rejected

  Scenario Outline: Longitude stays between -180 and 180
    Given a collection with one demand whose outline has a corner at longitude <longitude>
    When the collection is read
    Then the collection is <outcome>

    Examples:
      | longitude   | outcome  |
      | -180.000001 | rejected |
      | -180        | accepted |
      | -179.999999 | accepted |
      | 179.999999  | accepted |
      | 180         | accepted |
      | 180.000001  | rejected |

  Scenario Outline: Latitude stays between -90 and 90
    Given a collection with one demand whose outline has a corner at latitude <latitude>
    When the collection is read
    Then the collection is <outcome>

    Examples:
      | latitude   | outcome  |
      | -90.000001 | rejected |
      | -90        | accepted |
      | -89.999999 | accepted |
      | 89.999999  | accepted |
      | 90         | accepted |
      | 90.000001  | rejected |

  Scenario Outline: A position is a longitude, a latitude and an optional altitude
    Given a collection with one demand whose positions each have <size> numbers
    When the collection is read
    Then the collection is <outcome>

    Examples:
      | size | outcome  |
      | 1    | rejected |
      | 2    | accepted |
      | 3    | accepted |
      | 4    | rejected |

  Scenario: One invalid demand rejects the whole collection
    Given a collection with 2 valid demands and a third whose name is ""
    When the collection is read
    Then the collection is rejected
    And no demands are read from it

  Scenario Outline: Something that is not a collection of demands is rejected
    Given <input>
    When the collection is read
    Then the collection is rejected

    Examples:
      | input                                         |
      | a single demand on its own                    |
      | a collection without a list of demands        |
      | a collection whose demands list is not a list |
      | nothing at all                                |

  Scenario: Demands may share a name
    Given a collection with the demands:
      | name  | country | customer    |
      | Depot | Egypt   | Acme Energy |
      | Depot | Egypt   | Nile Farms  |
    When the collection is read
    Then it holds 2 demands
    And the first is for "Acme Energy" and the second for "Nile Farms"
