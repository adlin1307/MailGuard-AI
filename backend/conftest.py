"""
Pytest configuration for ProbMail backend tests.
Ensures tests run in an isolated test database (test_probmail.db)
so that automated test executions never contaminate the main probmail.db.
"""
import os
import pytest
from pathlib import Path
from config import BASE_DIR
from services.db import init_db

TEST_DB_PATH = BASE_DIR / "test_probmail.db"


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Initializes a separate test SQLite database for test runner isolation."""
    os.environ["TEST_DB_PATH"] = str(TEST_DB_PATH)
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except OSError:
            pass

    # Initialize schema on the isolated test DB
    init_db(target_db=str(TEST_DB_PATH))

    yield

    # Clean up test DB after test suite completes
    os.environ.pop("TEST_DB_PATH", None)
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except OSError:
            pass


@pytest.fixture
def client():
    """Provides an isolated Flask test client pointing to test_probmail.db."""
    from app import create_app
    app = create_app()
    app.config["TESTING"] = True
    app.config["TEST_DB_PATH"] = str(TEST_DB_PATH)
    with app.test_client() as test_client:
        yield test_client
