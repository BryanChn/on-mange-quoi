
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "foods": {
                  Row: {
                    "carbs_g": number | null,"fat_g": number | null,"group_name": string | null,"id": number,"kcal": number | null,"name": string,"protein_g": number | null,"search_text": string | null,"unit_weight_g": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "carbs_g"?: number | null,"fat_g"?: number | null,"group_name"?: string | null,"id": number,"kcal"?: number | null,"name": string,"protein_g"?: number | null,"search_text"?: never,"unit_weight_g"?: number | null
                  }
                  Update: {
                    "carbs_g"?: number | null,"fat_g"?: number | null,"group_name"?: string | null,"id"?: number,"kcal"?: number | null,"name"?: string,"protein_g"?: number | null,"search_text"?: never,"unit_weight_g"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"group_members": {
                  Row: {
                    "group_id": string,"joined_at": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"joined_at"?: string,"profile_id": string
                  }
                  Update: {
                    "group_id"?: string,"joined_at"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "created_at": string,"digest_pending_since": string | null,"digest_sent_at": string | null,"id": string,"invite_code": string,"join_token": string | null,"kind": Database["public"]['Enums']["group_kind"],"meal_date": string | null,"meal_day_reminded_at": string | null,"name": string,"ordered_at": string | null,"owner_digest_pending_since": string | null,"owner_digest_sent_at": string | null,"owner_id": string,"restaurant": string | null,"soiree_mode": Database["public"]['Enums']["soiree_mode"] | null,"soiree_step": Database["public"]['Enums']["soiree_step"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"digest_pending_since"?: string | null,"digest_sent_at"?: string | null,"id"?: string,"invite_code": string,"join_token"?: string | null,"kind"?: Database["public"]['Enums']["group_kind"],"meal_date"?: string | null,"meal_day_reminded_at"?: string | null,"name": string,"ordered_at"?: string | null,"owner_digest_pending_since"?: string | null,"owner_digest_sent_at"?: string | null,"owner_id": string,"restaurant"?: string | null,"soiree_mode"?: Database["public"]['Enums']["soiree_mode"] | null,"soiree_step"?: Database["public"]['Enums']["soiree_step"] | null
                  }
                  Update: {
                    "created_at"?: string,"digest_pending_since"?: string | null,"digest_sent_at"?: string | null,"id"?: string,"invite_code"?: string,"join_token"?: string | null,"kind"?: Database["public"]['Enums']["group_kind"],"meal_date"?: string | null,"meal_day_reminded_at"?: string | null,"name"?: string,"ordered_at"?: string | null,"owner_digest_pending_since"?: string | null,"owner_digest_sent_at"?: string | null,"owner_id"?: string,"restaurant"?: string | null,"soiree_mode"?: Database["public"]['Enums']["soiree_mode"] | null,"soiree_step"?: Database["public"]['Enums']["soiree_step"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_notification_mutes": {
                  Row: {
                    "created_at": string,"group_id": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"profile_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_notification_mutes_group_id_profile_id_fkey"
      columns: ["group_id","profile_id"]
isOneToOne: true
      referencedRelation: "group_members"
      referencedColumns: ["group_id","profile_id"]
    }
                  ]
                },"notification_settings": {
                  Row: {
                    "meals": boolean,"profile_id": string,"shopping": boolean,"updated_at": string,"votes": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "meals"?: boolean,"profile_id": string,"shopping"?: boolean,"updated_at"?: string,"votes"?: boolean
                  }
                  Update: {
                    "meals"?: boolean,"profile_id"?: string,"shopping"?: boolean,"updated_at"?: string,"votes"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_settings_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"label": string,"note": string | null,"profile_id": string,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"label": string,"note"?: string | null,"profile_id"?: string,"quantity"?: number
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"label"?: string,"note"?: string | null,"profile_id"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_group_id_profile_id_fkey"
      columns: ["group_id","profile_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","profile_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar": string | null,"created_at": string,"display_name": string,"id": string,"is_guest": boolean,"photo_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar"?: string | null,"created_at"?: string,"display_name": string,"id": string,"is_guest"?: boolean,"photo_path"?: string | null
                  }
                  Update: {
                    "avatar"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"is_guest"?: boolean,"photo_path"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"proposals": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"proposed_by": string | null,"recipe_id": string | null,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"proposed_by"?: string | null,"recipe_id"?: string | null,"session_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"proposed_by"?: string | null,"recipe_id"?: string | null,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposals_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "vote_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"push_tickets": {
                  Row: {
                    "created_at": string,"id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"token": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tickets_token_fkey"
      columns: ["token"]
isOneToOne: false
      referencedRelation: "push_tokens"
      referencedColumns: ["token"]
    }
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"profile_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"profile_id": string,"token": string
                  }
                  Update: {
                    "created_at"?: string,"profile_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "food_id": number | null,"id": string,"label": string,"position": number,"quantity": number | null,"raw": string,"recipe_id": string,"unit": Database["public"]['Enums']["ingredient_unit"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "food_id"?: number | null,"id"?: string,"label": string,"position": number,"quantity"?: number | null,"raw": string,"recipe_id": string,"unit"?: Database["public"]['Enums']["ingredient_unit"] | null
                  }
                  Update: {
                    "food_id"?: number | null,"id"?: string,"label"?: string,"position"?: number,"quantity"?: number | null,"raw"?: string,"recipe_id"?: string,"unit"?: Database["public"]['Enums']["ingredient_unit"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_food_id_fkey"
      columns: ["food_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_ingredients_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "budget": number | null,"category": Database["public"]['Enums']["recipe_category"] | null,"chef_tip": string | null,"created_at": string,"created_by": string | null,"diets": (Database["public"]['Enums']["recipe_diet"])[],"group_id": string | null,"id": string,"photo_path": string | null,"servings": number,"source_recipe_id": string | null,"steps": (string)[],"title": string,"total_minutes": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget"?: number | null,"category"?: Database["public"]['Enums']["recipe_category"] | null,"chef_tip"?: string | null,"created_at"?: string,"created_by"?: string | null,"diets"?: (Database["public"]['Enums']["recipe_diet"])[],"group_id"?: string | null,"id"?: string,"photo_path"?: string | null,"servings"?: number,"source_recipe_id"?: string | null,"steps"?: (string)[],"title": string,"total_minutes"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "budget"?: number | null,"category"?: Database["public"]['Enums']["recipe_category"] | null,"chef_tip"?: string | null,"created_at"?: string,"created_by"?: string | null,"diets"?: (Database["public"]['Enums']["recipe_diet"])[],"group_id"?: string | null,"id"?: string,"photo_path"?: string | null,"servings"?: number,"source_recipe_id"?: string | null,"steps"?: (string)[],"title"?: string,"total_minutes"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_source_recipe_id_fkey"
      columns: ["source_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_items": {
                  Row: {
                    "added_by": string | null,"checked_at": string | null,"checked_by": string | null,"cleared_at": string | null,"created_at": string,"group_id": string,"id": string,"label": string,"quantity": string | null,"recipe_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"checked_at"?: string | null,"checked_by"?: string | null,"cleared_at"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"label": string,"quantity"?: string | null,"recipe_id"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"checked_at"?: string | null,"checked_by"?: string | null,"cleared_at"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"label"?: string,"quantity"?: string | null,"recipe_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_items_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_items_checked_by_fkey"
      columns: ["checked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_items_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_items_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"shopping_trips": {
                  Row: {
                    "added_pending_since": string | null,"added_sent_at": string | null,"announced": boolean,"ends_at": string,"group_id": string,"id": string,"shopper_id": string,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_pending_since"?: string | null,"added_sent_at"?: string | null,"announced": boolean,"ends_at"?: string,"group_id": string,"id"?: string,"shopper_id": string,"started_at"?: string
                  }
                  Update: {
                    "added_pending_since"?: string | null,"added_sent_at"?: string | null,"announced"?: boolean,"ends_at"?: string,"group_id"?: string,"id"?: string,"shopper_id"?: string,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_trips_group_id_shopper_id_fkey"
      columns: ["group_id","shopper_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","profile_id"]
    }
                  ]
                },"soiree_contributions": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"label": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"label": string,"profile_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"label"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "soiree_contributions_group_id_profile_id_fkey"
      columns: ["group_id","profile_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["group_id","profile_id"]
    }
                  ]
                },"vote_sessions": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"decided_by": Database["public"]['Enums']["decision_method"] | null,"group_id": string,"id": string,"moment": Database["public"]['Enums']["meal_moment"] | null,"organizer_id": string | null,"reminder_sent_at": string | null,"status": Database["public"]['Enums']["session_status"],"topic": Database["public"]['Enums']["vote_topic"],"winner_proposal_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"decided_by"?: Database["public"]['Enums']["decision_method"] | null,"group_id": string,"id"?: string,"moment"?: Database["public"]['Enums']["meal_moment"] | null,"organizer_id"?: string | null,"reminder_sent_at"?: string | null,"status"?: Database["public"]['Enums']["session_status"],"topic"?: Database["public"]['Enums']["vote_topic"],"winner_proposal_id"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"decided_by"?: Database["public"]['Enums']["decision_method"] | null,"group_id"?: string,"id"?: string,"moment"?: Database["public"]['Enums']["meal_moment"] | null,"organizer_id"?: string | null,"reminder_sent_at"?: string | null,"status"?: Database["public"]['Enums']["session_status"],"topic"?: Database["public"]['Enums']["vote_topic"],"winner_proposal_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vote_sessions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vote_sessions_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vote_sessions_winner_fk"
      columns: ["winner_proposal_id","id"]
isOneToOne: false
      referencedRelation: "proposals"
      referencedColumns: ["id","session_id"]
    }
                  ]
                },"votes": {
                  Row: {
                    "created_at": string,"profile_id": string,"proposal_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"profile_id": string,"proposal_id": string
                  }
                  Update: {
                    "created_at"?: string,"profile_id"?: string,"proposal_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "votes_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "votes_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: false
      referencedRelation: "proposals"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "call_edge_function":
{ Args: { "function_name": string,"payload": Json }; Returns: undefined
                           },
"can_edit_recipe":
{ Args: { "target_recipe_id": string }; Returns: boolean
                           },
"can_read_recipe":
{ Args: { "target_recipe_id": string }; Returns: boolean
                           },
"choose_restaurant":
{ Args: { "restaurant_name": string,"target_group_id": string }; Returns: {
              "created_at": string,
"digest_pending_since": string | null,
"digest_sent_at": string | null,
"id": string,
"invite_code": string,
"join_token": string | null,
"kind": Database["public"]['Enums']["group_kind"],
"meal_date": string | null,
"meal_day_reminded_at": string | null,
"name": string,
"ordered_at": string | null,
"owner_digest_pending_since": string | null,
"owner_digest_sent_at": string | null,
"owner_id": string,
"restaurant": string | null,
"soiree_mode": Database["public"]['Enums']["soiree_mode"] | null,
"soiree_step": Database["public"]['Enums']["soiree_step"] | null
            }
                          SetofOptions: {
        from: "*"
        to: "groups"
        isOneToOne: true
        isSetofReturn: false
      } },
"close_session":
{ Args: { "chosen_proposal_id"?: string,"method"?: Database["public"]['Enums']["decision_method"],"target_session_id": string }; Returns: {
              "closed_at": string | null,
"created_at": string,
"decided_by": Database["public"]['Enums']["decision_method"] | null,
"group_id": string,
"id": string,
"moment": Database["public"]['Enums']["meal_moment"] | null,
"organizer_id": string | null,
"reminder_sent_at": string | null,
"status": Database["public"]['Enums']["session_status"],
"topic": Database["public"]['Enums']["vote_topic"],
"winner_proposal_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "vote_sessions"
        isOneToOne: true
        isSetofReturn: false
      } },
"copy_base_recipe":
{ Args: { "base_recipe_id": string,"target_group_id": string }; Returns: string
                           },
"create_group":
{ Args: { "group_name": string }; Returns: {
              "created_at": string,
"digest_pending_since": string | null,
"digest_sent_at": string | null,
"id": string,
"invite_code": string,
"join_token": string | null,
"kind": Database["public"]['Enums']["group_kind"],
"meal_date": string | null,
"meal_day_reminded_at": string | null,
"name": string,
"ordered_at": string | null,
"owner_digest_pending_since": string | null,
"owner_digest_sent_at": string | null,
"owner_id": string,
"restaurant": string | null,
"soiree_mode": Database["public"]['Enums']["soiree_mode"] | null,
"soiree_step": Database["public"]['Enums']["soiree_step"] | null
            }
                          SetofOptions: {
        from: "*"
        to: "groups"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_soiree":
{ Args: { "meal_mode"?: Database["public"]['Enums']["soiree_mode"],"on_date"?: string,"soiree_name": string,"vote_topics"?: (Database["public"]['Enums']["vote_topic"])[] }; Returns: {
              "created_at": string,
"digest_pending_since": string | null,
"digest_sent_at": string | null,
"id": string,
"invite_code": string,
"join_token": string | null,
"kind": Database["public"]['Enums']["group_kind"],
"meal_date": string | null,
"meal_day_reminded_at": string | null,
"name": string,
"ordered_at": string | null,
"owner_digest_pending_since": string | null,
"owner_digest_sent_at": string | null,
"owner_id": string,
"restaurant": string | null,
"soiree_mode": Database["public"]['Enums']["soiree_mode"] | null,
"soiree_step": Database["public"]['Enums']["soiree_step"] | null
            }
                          SetofOptions: {
        from: "*"
        to: "groups"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"end_shopping_trip":
{ Args: { "target_group_id": string }; Returns: undefined
                           },
"food_search_text":
{ Args: { "value": string }; Returns: string
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"generate_join_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_session_result":
{ Args: { "target_session_id": string }; Returns: {
              "is_leading": boolean,"name": string,"proposal_id": string,"vote_count": number
            }[]
                           },
"is_anonymous_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_foyer_member":
{ Args: { "target_group_id": string }; Returns: boolean
                           },
"is_foyer_member_folder":
{ Args: { "folder": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "target_group_id": string }; Returns: boolean
                           },
"join_group":
{ Args: { "code": string }; Returns: string
                           },
"join_soiree":
{ Args: { "guest_avatar"?: string,"guest_name"?: string,"token": string }; Returns: string
                           },
"leave_group":
{ Args: { "new_owner_id"?: string,"target_group_id": string }; Returns: undefined
                           },
"lock_open_session":
{ Args: { "target_session_id": string }; Returns: undefined
                           },
"lock_soiree_ordering":
{ Args: { "target_group_id": string }; Returns: undefined
                           },
"mark_ordered":
{ Args: { "target_group_id": string }; Returns: {
              "created_at": string,
"digest_pending_since": string | null,
"digest_sent_at": string | null,
"id": string,
"invite_code": string,
"join_token": string | null,
"kind": Database["public"]['Enums']["group_kind"],
"meal_date": string | null,
"meal_day_reminded_at": string | null,
"name": string,
"ordered_at": string | null,
"owner_digest_pending_since": string | null,
"owner_digest_sent_at": string | null,
"owner_id": string,
"restaurant": string | null,
"soiree_mode": Database["public"]['Enums']["soiree_mode"] | null,
"soiree_step": Database["public"]['Enums']["soiree_step"] | null
            }
                          SetofOptions: {
        from: "*"
        to: "groups"
        isOneToOne: true
        isSetofReturn: false
      } },
"meal_news_count":
{ Args: { "since": string,"target_group_id": string }; Returns: number
                           },
"proposal_has_votes":
{ Args: { "target_proposal_id": string }; Returns: boolean
                           },
"purge_soirees":
{ Args: { "reference_time"?: string }; Returns: number
                           },
"recipe_steps_are_valid":
{ Args: { "steps": (string)[] }; Returns: boolean
                           },
"regenerate_invite_code":
{ Args: { "target_group_id": string }; Returns: string
                           },
"register_push_token":
{ Args: { "new_token": string }; Returns: undefined
                           },
"save_recipe":
{ Args: { "ingredients": Json,"recipe_category"?: Database["public"]['Enums']["recipe_category"],"recipe_chef_tip"?: string,"recipe_diets"?: (Database["public"]['Enums']["recipe_diet"])[],"recipe_servings": number,"recipe_steps": (string)[],"recipe_title": string,"target_group_id": string,"target_recipe_id"?: string }; Returns: string
                           },
"search_foods":
{ Args: { "query": string }; Returns: {
              "group_name": string,"id": number,"name": string
            }[]
                           },
"send_meal_day_reminders":
{ Args: { "reference_time"?: string }; Returns: number
                           },
"send_meal_digests":
{ Args: { "reference_time"?: string }; Returns: number
                           },
"send_shopping_additions":
{ Args: { "reference_time"?: string }; Returns: number
                           },
"send_vote_reminders":
{ Args: { "reference_time"?: string }; Returns: number
                           },
"shares_group_with":
{ Args: { "folder": string }; Returns: boolean
                           },
"soiree_preview":
{ Args: { "token": string }; Returns: {
              "id": string,"is_member": boolean,"member_count": number,"members": Json,"name": string,"owner_name": string,"step": Database["public"]['Enums']["soiree_step"]
            }[]
                           },
"start_shopping_trip":
{ Args: { "target_group_id": string }; Returns: {
              "added_pending_since": string | null,
"added_sent_at": string | null,
"announced": boolean,
"ends_at": string,
"group_id": string,
"id": string,
"shopper_id": string,
"started_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "shopping_trips"
        isOneToOne: true
        isSetofReturn: false
      } },
"tidy_text":
{ Args: { "value": string }; Returns: string
                           }
          }
          Enums: {
            "decision_method": "vote"|"tirage"|"organisateur","group_kind": "foyer"|"soiree","ingredient_unit": "g"|"kg"|"ml"|"cl"|"l"|"cuillere_cafe"|"cuillere_soupe"|"pincee","meal_moment": "midi"|"soir","recipe_category": "viande"|"poisson"|"vege"|"dessert","recipe_diet": "vegetarien"|"vegan"|"sans_porc"|"sans_gluten"|"sans_lactose","session_status": "open"|"closed","soiree_mode": "commande"|"resto"|"maison","soiree_step": "choix"|"commande"|"passee"|"decide","vote_topic": "plat"|"resto"|"apero"|"entree"|"dessert"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "decision_method": ["vote", "tirage", "organisateur"],"group_kind": ["foyer", "soiree"],"ingredient_unit": ["g", "kg", "ml", "cl", "l", "cuillere_cafe", "cuillere_soupe", "pincee"],"meal_moment": ["midi", "soir"],"recipe_category": ["viande", "poisson", "vege", "dessert"],"recipe_diet": ["vegetarien", "vegan", "sans_porc", "sans_gluten", "sans_lactose"],"session_status": ["open", "closed"],"soiree_mode": ["commande", "resto", "maison"],"soiree_step": ["choix", "commande", "passee", "decide"],"vote_topic": ["plat", "resto", "apero", "entree", "dessert"]
          }
        }
} as const
