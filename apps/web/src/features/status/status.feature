Feature: Status page
  Anyone can see whether the service is working.

  Scenario: The API is healthy
    Given the API reports status "ok"
    When I open the status page
    Then I see "All systems operational"

  Scenario: The database is down
    Given the API reports status "degraded"
    When I open the status page
    Then I see "Degraded: database down"
