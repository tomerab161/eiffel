Feature: Health check
  Operators and the web app ask the API whether it can serve requests.

  Scenario: The database answers
    Given the database is up
    When a client asks for GET /api/health
    Then the response status is 200
    And the reported status is "ok"

  Scenario: The database does not answer
    Given the database is down
    When a client asks for GET /api/health
    Then the response status is 503
    And the reported status is "degraded"
