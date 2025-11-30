import logging
import re
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
from database.connection import users_collection

logger = logging.getLogger(__name__)
auth_bp = Blueprint('auth', __name__)

def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

@auth_bp.route('/api/auth/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not name or not email or not password:
            return jsonify({"error": "Name, email, and password are required"}), 400

        if len(name) > 100:
            return jsonify({"error": "Name too long (max 100 characters)"}), 400

        if not validate_email(email):
            return jsonify({"error": "Invalid email format"}), 400

        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        if users_collection.find_one({"email": email}):
            return jsonify({"error": "Email already exists"}), 409

        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        
        user_data = {
            "name": name,
            "email": email,
            "password": hashed_password.decode('utf-8'),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = users_collection.insert_one(user_data)
        token = create_access_token(identity=email)
        
        return jsonify({
            "message": "User created successfully",
            "token": token,
            "user": {"name": name, "email": email}
        }), 201

    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        return jsonify({"error": "Signup failed"}), 500

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        user = users_collection.find_one({"email": email})
        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        if not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
            return jsonify({"error": "Invalid email or password"}), 401

        token = create_access_token(identity=email)
        
        return jsonify({
            "message": "Login successful",
            "token": token,
            "user": {"name": user['name'], "email": user['email']}
        }), 200

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({"error": "Login failed"}), 500

@auth_bp.route('/api/auth/verify', methods=['GET'])
@jwt_required()
def verify():
    try:
        email = get_jwt_identity()
        user = users_collection.find_one({"email": email})
        
        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "user": {"name": user['name'], "email": user['email']}
        }), 200

    except Exception as e:
        logger.error(f"Verify error: {str(e)}")
        return jsonify({"error": "Verification failed"}), 500

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    return jsonify({"message": "Logout successful"}), 200
