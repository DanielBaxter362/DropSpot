from flask import Flask
from flask_cors import CORS

from routes import init_routes
from addSpot import init_addSpot


app = Flask(
    __name__,
    template_folder="../frontend/html",
    static_folder="../frontend",
)
app.secret_key = "dev-secret-key"
CORS(app)

init_routes(app)
init_addSpot(app)

if __name__ == "__main__":
    app.run(debug=True)
