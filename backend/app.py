import logging
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config.settings import MAX_CONTENT_LENGTH, JWT_SECRET_KEY, JWT_ACCESS_TOKEN_EXPIRES

# Import blueprints
from routes.health import health_bp
from routes.vendor import vendor_bp
from routes.problem_statement import ps_bp
from routes.matching import matching_bp
from routes.auth import auth_bp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
app.config['JWT_SECRET_KEY'] = JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = JWT_ACCESS_TOKEN_EXPIRES

# Initialize JWT
jwt = JWTManager(app)

# Register blueprints
app.register_blueprint(health_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(vendor_bp)
app.register_blueprint(ps_bp)
app.register_blueprint(matching_bp)

@app.before_request
def log_request():
    """Log all incoming requests"""
    from flask import request
    logger.info(f"{request.method} {request.path} from {request.remote_addr}")

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error"""
    return jsonify({
        "error": f"File too large. Maximum size: {app.config['MAX_CONTENT_LENGTH'] / (1024*1024):.1f}MB"
    }), 413

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({"error": "Internal server error"}), 500

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired"}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Invalid token"}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authorization token is missing"}), 401

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
