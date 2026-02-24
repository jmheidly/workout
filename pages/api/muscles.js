import NextCors from 'nextjs-cors'
import { getMuscleGroups } from '../../lib/db-helper'

const handler = async (req, res) => {
  await NextCors(req, res, {
    // Options
    methods: ['GET'],
    origin: '*',
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  })

  if (req.method === 'GET') {
    const { equipment = '' } = req.query
    const mappedEquipment = equipment.split(',').filter(Boolean)

    const workouts = await getMuscleGroups({ equipment: mappedEquipment })

    res.status(200).json(workouts)
  } else {
    res.status(404).send()
  }
}

export default handler
